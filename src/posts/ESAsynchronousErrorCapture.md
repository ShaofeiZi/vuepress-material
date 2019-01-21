---
title: ES6/ES7中promise、generator和async/await中的异常捕获方法
date: 2019-01-19 12:15:53
tags: [ES6,error]
---
简要介绍：ES6中为了处理异步，增加了*promise*、*generator*和*async*，它们各自都有不同的内部异常捕获方法，本文总结一下 *promise*、*generator*和*async* 的异常捕获方法。
- Promise的异常捕获方式
- generator的异常捕获方式
- async/await的异常捕获方式
<!-- more -->
总结
## 1. Promise的异常捕获方式
### (1) 在Promise的构造体内进行错误处理
```javascript
var promise=new Promise(function(resolve,reject){
   try {
      throw new Error('test');
   }catch(e){
      reject(e)
   }
})
```
在Promise的构造体内进行错误处理，类似于我们在ES5中的错误处理方式。

### (2) 通过Promise.prototype.catch来进行错误处理
生成Promise实例后，我们可以通过Promise原型上的catch方法来捕获Promise实例内部的错误。
```javascript
var promise=new Promise(function(resolve,reject){
   reject(new Error('test'));
})
promise.catch(function(e){
 //something to deal with the error
 console.log(e)
})
```
上述的例子，跟（1）中是类似的，此外catch方法还可以处理链式调用中的错误，比如：
```javascript
var promise=new Promise(function(resolve,reject){
   resolve();
})
promise.then(function(){
   // if some error throw
}).then(function(){
   // if some error throw
}).catch(function(e){
  //something to deal with the error
  console.log(e)
})

 // Error : test1
```
上述的代码中，最后一个catch方法可以捕获前面链式调用过程中任何一步then方法里面所抛出的错误。

catch方面里面还可以再抛错误，这个错误会被后面的catch捕获
```javascript
var promise=new Promise(function(resolve,reject){
  reject(new Error('test1'))
})
promise.catch(function(e){
  console.log(e);
  throw new Error('test2')
}).catch(function(e){
  console.log(e)
})

  // Error : test1
  // Error : test2
```
### (3) Promise.all中的异常捕获
如果组成Promise.all的promise有自己的错误捕获方法，那么Promise.all中的catch就不能捕获该错误。
```javascript
var p1=new Promise(function(resolve,reject){
  reject(new Error('test1'))
}).catch(function(e){
  console.log("由p1自身捕获",e);
})
var p2=new Promise(function(resolve,reject){
  resolve();
})
var p=Promise.all([p1,p2]);
p.then(function(){

}).catch(function(e){
  //在此处捕获不到p1中的error
  console.log(e)
})
//由p1自身捕获 Error: test1
```
### (4) Promise.try中的异常捕获
ES2018中可以通过Promise.try来同步处理，可能是异步也可能是同步的函数。
```javascript
function f(){}
Promise.try(f);
console.log(2);
上述的f方法，不管是同步还是异步，都会执行该方法，再输出2。

在Promise.try的错误处理中，通过catch方法既可以捕获f是同步函数情况下的错误，也可以捕获f是异步函数情况下的错误。

function f(){}
Promise.try(f).then(function(){

}).catch(function(e){

})
```
### (5) 在promise中无法被捕获的错误
在promise实例resolve之后，错误无法被捕获。
```javascript
var promise=new Promise(function(resolve,reject){
   resolve();
   throw new Error('test');//该错误无法被捕获
})
promise.then(function(){
  //
}).then(function(e){
  console.log(e)
})
```
该错误可以用尾调用resolve来避免。

## 2.generator中的异常捕获方式
(1) 构造体内部捕获
```javascript
function * F(){
   try{
     yield 1
   }catch(e){
     console.log(e)
   }
}
var f=F();
f.throw(new Error('test1'))
```
上述这样在内部不能捕获到test1错误，为什么呢？ 这个generator的原理有关，调用F（）仅仅返回一个状态生成器，并没有执行generator里面的方法，因此在f上直接跑错误是无法捕获的。

那么怎么才能捕获错误呢？采用如下的方式：
```javascript
function * F(){
   try{
     yield 1
   }catch(e){
     console.log(e)
   }
}
var f=F();
f.next()//增加了一句next执行，可以执行generator里面的内容
f.throw(new Error('test1'))
//捕获错误 Error test1
```
这样就能捕获该错误。

此外捕获错误后，会执行一次next方法
```javascript
function * F(){
   try{
     yield 1
   }catch(e){
     console.log(e)
   }
   yield 2
   return 3
}
var f=F();
f.next();  //{value :1,done:false}
f.throw(new Error('test1'))  //{value:2,done:false}
f.next();  //{value:3,done:true}
```
到次，我们现在直到在generator中，next、throw和done都会执行一次next方法。

(2) 在generator构造体外部捕获错误
```javascript
function F(){
  yield 1;
  yield 2;
  return 3;
}
var f=F();
try{
  f.throw(new Error('test1'))
}catch(e){
  console.log(e)
}
// Error test1
```
在构造体外部捕获，可以直接f.throw

(3) 如果Generator的错误没有被捕获，就不会继续执行
```javascript
function F(){
  yield 1;
  throw new Error('test1');
  yield 2;
  return 3
}
var f=F();
f.next() // {value:1,done:false}
f.next() // {value:undefined,done:true}
```
上述例子中，只要错误没有被处理，就会返回done:true就停止执行generator

## 3. async/await中的错误处理
### (1) async中的错误处理
因为async的返回值也是个promise,跟promise的错误处理差不多。

此外，async里面throw Error 相当于返回Promise.reject。
```javascript
async function F(){
  throw new Error('test1')
}
var f=F();
f.catch(function(e){console.log(e)});
// Error:test1
```
(2) await中的错误处理
在async中，await的错误相当于Promise.reject
```javascript
async function F(){
  await Promise.reject('Error test1').catch(function(e){
     console.log(e)
  })
}
var f=F(); // Error:test1
```
### (3) await中的promise.reject必须要被捕获
await如果返回的是reject状态的promise，如果不被捕获，就会中断async函数的执行。
```javascript
async function F(){
  await Promise.reject('Error test1');
  await 2
}
var f=F()
```
上述代码中，前面的Promise.reject没有被捕获，所以不会执行await 2

## 4.总结
> Promise、generator错误都可以在构造体里面被捕获，而async/await返回的是promise,可以通过catch直接捕获错误。

> generator 抛出的错误，以及await 后接的Promise.reject都必须被捕获，否则会中断执行。
