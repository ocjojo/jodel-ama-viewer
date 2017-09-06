(function($){

var data = [];
var ojs = {};
var postId = "59aea982039e85001026c0d8";
var next;

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

function getData(){
	var url = 'https://share.jodel.com/post/' + postId + '/replies?ojFilter=true'
	if(next)
		url += "&next=" + next;

	return $.get(url)
	.then(transformData)
}

function transformData(res){
	// save reference to next batch of replies
	next = res.next;

	// match important data in html string and save to objects
	// this is way faster than parsing the string to a dom representation
	var regex = /<.*(oj-text|time-text|post-message|votes).*>(.*)<.*>/g;
	var matches;
	var lastObj = {};
	while ((matches = regex.exec(res.html)) !== null) {
		switch(matches[1]){
			case "oj-text":
				lastObj.ojId = matches[2];
				// map post to oj
				if(Array.isArray(ojs[matches[2]])){
					ojs[matches[2]].push(lastObj);
				} else {
					ojs[matches[2]] = [lastObj];
				}
				break;
			case "time-text":
				lastObj.time = matches[2];
				break;
			case "post-message":
				// check for reference to other poster
				if(matches[2].charAt(0) == '@'){
					//if found, make clickable
					lastObj.message = matches[2].replace(/@(\w+)/, (match)=>{
						return '<span class="oj-link">' + match + '</span>';
					})
				} else {
					lastObj.message = matches[2];
				}
				break;
			default:
				lastObj.id = data.length;
				lastObj.votes = matches[2];
				data.push(lastObj);
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
      		this.$bus.$emit('filter-oj');
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
			this.post.reference = $event.target.innerText.slice(1);
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
			this.$bus.$emit('thread');
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
    posts: [],
    filter: null,
    thread: null,
    scroll: 0
  },
  methods:{
  	saveScroll: function(){
  		// save scroll position in original view
  		if(!this.thread && !this.filter){
  			this.scroll = $(window).scrollTop()
  		}
  	},
  	reScroll: function(){
		this.$nextTick(function () {
			// re-set scroll position in original view
			if(!this.thread && !this.filter){
				$(window).scrollTop(this.scroll)
			} else {
				$(window).scrollTop(0)
			}
		})
  	}
  },
  created() {
  	// get initial data
  	getData().then(()=>{
		this.posts = data
	});

	// endless scroll
	$(window).on("scroll", debounce(() =>{
		//no endless scroll in threads and filtered
		if(this.thread || this.filter) return;

		var scrollLeft = $(document).height() - $(window).scrollTop();
		var windowHeight = $(window).outerHeight();
		if (scrollLeft <= 2 * windowHeight) {
			getData().then(()=>{
				this.posts = data
			});
		}
	}, 1000));

	// event listener for filter-oj
	this.$bus.$on('filter-oj', (ojId) => {
		this.saveScroll();
		// leave thread, if there
		this.thread = null;
		if(ojId){
			this.posts = ojs[ojId]	
			this.filter = ojId
		} else {
			this.posts = data
			this.filter = null
		}
		this.reScroll();
    })

    //event listener for thread
    this.$bus.$on('thread', (post) => {
    	this.saveScroll();
		this.thread = post
		this.reScroll();
    })
  }
})

})(jQuery);