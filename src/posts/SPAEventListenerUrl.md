---
title: 在单页应用中，如何监听url的变化
date: 2019-01-19 16:15:53
tags: [SPA,URL,hash,history]
---
单页应用的原理从早起的根据url的hash变化，到根据H5的history的变化，实现无刷新条件下的页面重新渲染。那么在单页应用中是如何监听url的变化呢，本文将总结一下，如何在单页页面中优雅的监听url的变化。

单页应用原理
- 监听url中的hash变化
- 监听通过history来改变url的事件
- replaceState和pushState行为的监听
<!-- more -->
# 一、单页应用原理
页应用使得页面可以在无刷新的条件下重新渲染，通过hash或者html5 Bom对象中的history可以做到改变url，但是不刷新页面。
## (1)通过hash来实现单页路由
  早期的前端路由是通过hash来实现的：

  `改变url的hash值是不会刷新页面的。`

  因此可以通过hash来实现前端路由，从而实现无刷新的效果。hash属性位于location对象中，在当前页面中，可以通过：
```
window.location.hash='edit'
```
来实现改变当前url的hash值。执行上述的hash赋值后，页面的url发生改变。
```
赋值前：http://localhost:3000
赋值后：http://localhost:3000/#edit
```
在url中多了以#结尾的hash值，但是赋值前后虽然页面的hash值改变导致页面完整的url发生了改变，但是页面是不会刷新的。

此外，除了可以通过window.location.hash来改变当前页面的hash值外，还可以通过html的a标签来实现：
```
<a href="#edit">edit</a>
```
## (2)通过history实现前端路由
  HTML5的History接口，History对象是一个底层接口，不继承于任何的接口。History接口允许我们操作浏览器会话历史记录。

History提供了一些属性和方法。

> History的属性：

- History.length: 返回在会话历史中有多少条记录，包含了当前会话页面。此外如果打开一个新的Tab，那么这个length的值为1
- History.state:
保存了会出发popState事件的方法，所传递过来的属性对象（后面会在pushState和replaceState方法中详细的介绍）
> History方法：

- History.back(): 返回浏览器会话历史中的上一页，跟浏览器的回退按钮功能相同

- History.forward():指向浏览器会话历史中的下一页，跟浏览器的前进按钮相同

- History.go(): 可以跳转到浏览器会话历史中的指定的某一个记录页

- History.pushState():pushState可以将给定的数据压入到浏览器会话历史栈中，该方法接收3个参数，对象，title和一串url。pushState后会改变当前页面url，但是不会伴随着刷新

- History.replaceState():replaceState将当前的会话页面的url替换成指定的数据，replaceState后也会改变当前页面的url，但是也不会刷新页面。

上面的方法中，pushState和repalce的相同点：

`就是都会改变当前页面显示的url，但都不会刷新页面。`

不同点：

* pushState是压入浏览器的会话历史栈中，会使得History.length加1，而replaceState是替换当前的这条会话历史，因此不会增加History.length.*

## (3)总结
  通过改变hash值，或者history的repalceState和pushState都可以实现无刷新的改变url。这样还留有一个问题需要解决：

# 二、监听url中的hash变化
通过hash改变了url，会触发hashchange事件，只要监听hashchange事件，就能捕获到通过hash改变url的行为。
```javascript
window.onhashchange=function(event){
  console.log(event);
}
```
//或者
```javascript

window.addEventListener('hashchange',function(event){
   console.log(event);
})
```
当hash值改变时，输出一个HashChangeEvent。该HashChangeEvent的具体值为：
```javascript

{
isTrusted: true,
oldURL: "http://localhost:3000/",
newURL:   "http://localhost:3000/#teg",
type: "hashchange".....
}
```
有了监听事件，且改变hash页面不刷新，这样我们就可以在监听事件的回调函数中，执行我们展示和隐藏不同UI显示的功能，从而实现前端路由。
# 三、监听通过history来改变url的事件
在上一章讲到了通过History改变url有以下几种方法：History.back()、History.forward()、History.go()、History.pushState()和History.replaceState()。

同时在history中还支持一个事件，该事件为popstate。第一想法就是如果popstate能够监听所有的history方法所导致的url变化，那么就大功告成了。遗憾的是：

History.back()、History.forward()、History.go()事件是会触发popstate事件的，但是History.pushState()和History.replaceState()不会触发popstate事件。

如果是History.back(),History.forward()、History.go()那么会触发popstate事件，我们只需要：
```javascript
window.addEventListener('popstate', function(event) {
     console.log(event);
})
```
就可以监听到相应的行为，手动调用：
```javascript
window.history.go();
window.history.back();
window.history.forward();
```
都会触发这个事件，此外，在浏览器中点击后退和前进按钮也会触发popstate事件，这个事件内容为：
```javascript
PopStateEvent {isTrusted: true, state: null, type: "popstate", target: Window, currentTarget: Window, …}
```
但是，History.pushState()和History.replaceState()不会触发popstate事件，举例来说：
```javascript
window.addEventListener('popstate', function(event) {
     console.log(event);
})

window.history.pushState({first:'first'}, "page 2", "/first"})
```
上述例子中不会有任何的输出，因为并没有监听的popstate事件的发生。

但是History.go和History.back()等，虽然可以触发popstate事件，但是都会刷新页面，我们在单页应用中使用的是replaceState和pushState，
# 四、replaceState和pushState行为的监听
在上面的例子中我们发现History.replaceState和pushState确实不会触发popstate事件，那么如何监听这两个行为呢。可以通过在方法里面主动的去触发popState事件。另一种就是在方法中创建一个新的全局事件。

具体做法为：
```javascript
var _wr = function(type) {
   var orig = history[type];
   return function() {
       var rv = orig.apply(this, arguments);
      var e = new Event(type);
       e.arguments = arguments;
       window.dispatchEvent(e);
       return rv;
   };
};
 history.pushState = _wr('pushState');
 history.replaceState = _wr('replaceState');
````
这样就创建了2个全新的事件，事件名为pushState和replaceState，我们就可以在全局监听：
```javascript
window.addEventListener('replaceState', function(e) {
  console.log('THEY DID IT AGAIN! replaceState 111111');
});
window.addEventListener('pushState', function(e) {
  console.log('THEY DID IT AGAIN! pushState 2222222');
});
```
这样就可以监听到pushState和replaceState行为。
