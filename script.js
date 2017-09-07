(function($){

var postId;
var next;
var last;
var loading = false;

var data = [];
var ojs = {};

function debounce(fn, delay) {
	var timer = null;
	return function () {
		var context = this, args = arguments;
		clearTimeout(timer);
		timer = setTimeout(function () {
			fn.apply(context, args);
		}, delay);
	};
}

function getUrlParams(){
	var params = location.href.split('?');
	return !params[1]? {}: params[1].split('&')
    .reduce((params, param) => {
      let [ key, value ] = param.split('=');
      params[key] = value ? decodeURIComponent(value.replace(/\+/g, ' ')) : '';
      return params;
    }, { })
}

function hideLoader(){
	$('.loader').hide()
	loading = false;
}

function getData(){
	if(loading) return Promise.reject('already loading');
	if(last && next === last) return Promise.reject('Nothing more to load');
	if(!postId) return Promise.reject('no postId');

	loading = true;
	$('.loader').show()
	last = next;

	var url = 'https://share.jodel.com/post/' + postId + '/replies?ojFilter=true'
	if(next)
		url += "&next=" + next;
	
	return $.get(url)
	.then(transformData)
	.then(hideLoader, hideLoader)
}

function transformData(res){
	// save reference to next batch of replies
	next = res.next || next;

	// match important data in html string and save to objects
	// this is way faster than parsing the string to a dom representation
	var regex = /<.*(oj-text|time-text|post-message|votes).*>(.*)<.*>/g;
	var matches;
	var lastObj = {};
	while ((matches = regex.exec(res.html)) !== null) {
		switch(matches[1]){
			case "oj-text":
				lastObj.ojId = matches[2].toUpperCase();
				// map post to oj
				if(Array.isArray(ojs[lastObj.ojId])){
					ojs[lastObj.ojId].push(lastObj);
				} else {
					ojs[lastObj.ojId] = [lastObj];
				}
				break;
			case "time-text":
				lastObj.time = matches[2];
				break;
			case "post-message":
				// check for reference to other poster
				if(matches[2].charAt(0) == '@'){
					//if found, make clickable
					lastObj.message = matches[2].replace(/@(\w+)/g, (match)=>{
						return '<span class="oj-link">' + match.toUpperCase() + '</span>';
					})
				} else {
					lastObj.message = matches[2];
				}
				break;
			default:
				lastObj.id = data.length;
				lastObj.votes = matches[2];
				// filters out image posts atm
				if(lastObj.message){
					data.push(lastObj);	
				}
				lastObj = {};
				break;
		}
	}
}

//define global event bus
const EventBus = new Vue()
Object.defineProperties(Vue.prototype, {
	$bus: {
		get: function () {
			return EventBus
		}
	}
})

// filter component
Vue.component('oj-filter', {
	props: ['id'],
	methods: {
		reset: function(){
      		this.$bus.$emit('back');
		}
	},
	template: '#filter-template'
})

// post component
Vue.component('post', {
	props: ['post'],
	methods: {
		filterOj: function(){
      		this.$bus.$emit('filter-oj', this.post.ojId);
		},
		thread: function($event){
			if(!$($event.target).is('.oj-link')) return
			// set reference based on eventTarget as there might be multiple
			this.post.reference = $event.target.innerText.slice(1).toUpperCase();
			this.$bus.$emit('thread', this.post);
		}
	},
	template: '#post-template'
})

// thread component
Vue.component('thread', {
	props: ['post'],
	computed: {
		possibleParents: function () {
			return ojs[this.post.reference]
		}
	},
	methods: {
		back: function(){
			this.$bus.$emit('back');
		},
		setPadding: function(){
			this.$nextTick(function () {
				// set padding bottom to account for fixed post
			    $('.thread-box').css('padding-bottom', $('#reference-post').height() + 14)
			})
		},
		// noop, as the function is referenced in click event
		thread: function(){}
	},
	mounted: function(){
		this.setPadding()
	},
	updated: function(){
		this.setPadding()
	},
	template: '#thread-template'
})

var app = new Vue({
  el: '#app',
  data: {
  	states: [{
  		posts: [],
	    filter: null,
	    thread: null,
	    scroll: 0
  	}],
    input: false
  },
  computed: {
		currentState: function () {
			return this.states[this.states.length - 1];
		}
	},
  methods:{
  	saveScroll: function(){
  		// save scroll position in original view
		this.currentState.scroll = $(window).scrollTop()
  	},
  	reScroll: function(){
		this.$nextTick(function () {
			// re-set scroll position in original view
			$(window).scrollTop(this.currentState.scroll)
		})
  	}
  },
  created() {
  	var params = getUrlParams();
  	if(params.postId){
  		postId = params.postId;
  		// get initial data
	  	getData().then(()=>{
			this.currentState.posts = data
		});
  	} else {
  		this.input = true
  	}

	// endless scroll
	$(window).on("scroll", debounce(() =>{
		var scrollLeft = $(document).height() - $(window).scrollTop();
		var windowHeight = $(window).outerHeight();
		if (scrollLeft <= 2 * windowHeight) {
			getData().then(()=>{
				if(this.currentState.filter){
					this.currentState.posts = ojs[this.currentState.filter];	
				} else {
					this.currentState.posts = data;
				}
			});
		}
	}, 250));

	// event listener for filter-oj
	this.$bus.$on('filter-oj', (ojId) => {
		this.saveScroll();
		this.states.push({
			scroll: 0,
			filter: ojId,
			posts: ojs[ojId]
		})
		this.reScroll();
    })

    //event listener for thread
    this.$bus.$on('thread', (post) => {
		this.saveScroll();
		this.states.push({
			scroll: 0,
			thread: post,
			posts: ojs[post.reference],
			filter: [post.reference]
		})
		this.reScroll();
    })

    this.$bus.$on('back', (post) => {
    	this.states.pop();
    	this.reScroll();
    })
  }
})

})(jQuery);