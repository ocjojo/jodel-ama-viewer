(function($){

var data = [];
var ojs = {};
var next;

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
				lastObj.message = matches[2];
				// check for reference to other poster
				if(matches[2].charAt(0) == '@'){
					//if found, only get reference
					lastObj.reference = matches[2].split(' ', 1)[0].slice(1);
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
		filterOj: function(post){
      		this.$bus.$emit('filter-oj', post.ojId);
		}
	},
	template: '#post-template'
})

var app = new Vue({
  el: '#app',
  data: {
    posts: [],
    filter: null
  },
  created() {
  	// get initial data
  	$.get('https://share.jodel.com/post/59aea982039e85001026c0d8/replies?ojFilter=true')
	.then(transformData)
	.then(()=>{
		this.posts = data
	})
	// event listener for filter-oj
	this.$bus.$on('filter-oj', (ojId) => {
		if(ojId){
			this.posts = ojs[ojId]	
			this.filter = ojId
		} else {
			this.posts = data
			this.filter = null
		}
		
    })
  }
})

})(jQuery);