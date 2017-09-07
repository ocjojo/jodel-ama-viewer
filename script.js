(function($){

var postId;
var next;
var last;
var finished = false;

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

function getData(){
	if(!postId) return Promise.reject('no postId');

	last = next;

	var url = 'https://share.jodel.com/post/' + postId + '/replies?ojFilter=true'
	if(next)
		url += "&next=" + next;
	
	return $.get(url)
	.then(transformData)
}

function transformData(res){
	// save reference to next batch of replies
	if(res.next){
		next =  res.next	
	} else {
		finished = true
	}

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
				lastObj.references = [];
				// check for reference to other poster
				lastObj.message = matches[2].replace(/@(\w+)/g, (match, m1)=>{
					lastObj.references.push(m1.toUpperCase());
					//if found, make clickable
					return '<span class="oj-link">' + match.toUpperCase() + '</span>'
				})
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
Vue.component('state', {
	props: ['state'],
	
	methods: {
		back: function(){
      		this.$bus.$emit('back');
		}
	},
	template: '#state-template'
})

// post component
Vue.component('post', {
	props: ['post'],
	methods: {
		filterOj: function(){
      		this.$bus.$emit('filter-oj', this.post.ojId);
		},
		thread: function($event){
			// if clicked on reference -> show possible questions by the @mention user
			if($($event.target).is('.oj-link')){
				// set reference based on eventTarget as there might be multiple
				var reference = $event.target.innerText.slice(1).toUpperCase();
				this.$bus.$emit('thread', {
					pinned: this.post,
					filter: reference,
					refIsAnswer: true,
					name: "Possible questions by User " + reference
				});
			// if clicked on post in general, find answers from OJ
			} else if(this.post.ojId != 'OJ' && !$($event.target).is('.oj')){
				this.$bus.$emit('thread', {
					pinned: this.post,
					filter: {
						ojToId: this.post.ojId
					},
					name: "Answers from OJ"
				});
			}
		}
	},
	template: '#post-template'
})

// thread component
Vue.component('reference-post', {
	props: ['post'],
	methods: {
		setPadding: function(){
			this.$nextTick(function () {
				var height = $('#reference-post').height()
				height = height ? height + 14 : 0
		    	$('#app').css('padding-bottom',  height)
			})
		}
	},
	updated: function(){
		this.setPadding()
	},
	template: '#reference-post-template'
})

var app = new Vue({
  el: '#app',
  data: {
  	states: [{
	    filter: null,
	    pinned: null,
	    scroll: 0
  	}],
  	loading: false,
  	finished: false,
    input: false
  },
  computed: {
		currentState: function () {
			return this.states[this.states.length - 1]
		},
		showLoadMore: function(){
			return !this.finished && !this.loading && this.currentState.name
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
  	},
  	loadMore: function(){
  		if(this.loading) return

  		this.loading = true
  		getData().then(()=>{
			this.loading = false
			this.finished = finished
		});
  	},
  	posts: function(){
		var filter = this.currentState.filter
		if(typeof filter == "string")
		{
			return ojs[filter];
		} else if(typeof filter =="object"
			&& filter !== null
			&& typeof filter.ojToId == "string")
		{
			return ojs.OJ.filter(post=>{
				return post.references && post.references.indexOf(filter.ojToId) > -1
			})
		} else
		{
			return data
		}
	}
  },
  created() {
  	var params = getUrlParams();
  	if(params.postId){
  		postId = params.postId;
  		// get initial data
	  	this.loadMore()
  	} else {
  		this.input = true
  	}

	// endless scroll
	$(window).on("scroll", debounce(() =>{
		if(finished) return

		var scrollLeft = $(document).height() - $(window).scrollTop();
		var windowHeight = $(window).outerHeight();
		if (scrollLeft <= 2 * windowHeight) {
			this.loadMore()
		}
	}, 250));

	// event listener for filter-oj
	this.$bus.$on('filter-oj', (ojId) => {
		this.saveScroll();
		this.states.push({
			scroll: 0,
			filter: ojId,
			name: "Posts by " + ojId
		})
		this.reScroll();
    })

    //event listener for thread
    this.$bus.$on('thread', (state) => {
		this.saveScroll();
		state.scroll = 0
		this.states.push(state)
		this.reScroll();
    })

    this.$bus.$on('back', () => {
    	this.states.pop();
    	this.reScroll();
    })
  }
})

})(jQuery);