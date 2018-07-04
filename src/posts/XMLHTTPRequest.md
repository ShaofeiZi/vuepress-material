---
title: ajax 原理与封装
tags: [前端, ajax, XMLHTTPRequest]
date: 2018-07-04 10:22:38
description: 本文所提及的内容不兼容古老的 IE，有想了解的同学自行查阅 ActiveXObject 相关内容。
---

说起 ajax，大家都不陌生。但是由于目前很多框架或者库等都对网络请求做了封装，导致了很多初学者只知其然而不知其所以然。所以今天我们就详细了解一下 ajax 的实现原理和封装 ajax 的关键步骤。

ajax 的核心是 XMLHttpRequest 对象。首先我们先创建一个 XMLHTTPRequest 对象
```javascript
var xhr = new XMLHttpRequest()
```
<!-- more -->
# XMLHttpRequest

在使用 XMLHttpRequest 对象的第一步，我们首先要调用 open 方法来初始化请求参数，
```javascript
xhr.open('get','/test',true)
```
虽然名字叫 open，但是此时请求还并没有发送。

open(method, url[, async, username, password])

- method: 请求类型，例如 GET，POST 等
- url: 请求地址（这里有同源限制，就是我们经常会看到的跨域问题啦）
- async: 是否发送异步请求。可选参数，默认为 true。
- username&password: 可选参数，授权验证使用的，但是我们一般不这么用, 使用后请求变成这个样子了,
```
 http(s)://username:password@url。
```
> 如果调用了 open 方法后再次对它进行调用，则相当于调用了 abort 方法，abort 方法我们在后面介绍。

## 如果我们想为为请求绑定一些操作，这个时候就可以开始啦。常用的操作有如下几个：
### setRequestHeader(key, value)
顾名思义，这个方法用于设置请求头内容。

- key: 要设置的请求头名称
- value: 对应请求头的值

### overrideMimeType(type)

重写服务器返回的 MIME 类型。通过这个方法可以告诉服务器你想要的数据类型。

> 注意：以上这些操作必须定义在 send 方法之前。否则，就拿 setRequestHeader 来说，你都把请求发出去了再设置还有什么用？

这个时候，我们就可以通过调用 send 方法来发送请求了，xhr.send(null)。

### send(data)

发送请求，如果是同步请求的话，会阻塞代码的执行，直至收到服务器响应才会继续。

- data: 发送给服务器的数据。为了兼容不同的浏览器，即使是不需要传数据，也需要传入参数 null。
### readyStateChanhe()

每次 readyState 的值改变的时候都会触发这个函数。

具体状态见下文


### getResponseHeader(name)
获取指定响应头部的值，参数是响应头部的名称，并且不区分大小写。
### getAllResponseHeaders()
获取服务器发送的所有HTTP响应的头部。
在这里我们穿插几个概念，readyState，这个属性表明了请求的状态，伴随HTTP请求的整个生命周期，它的值表明此时请求所处的阶段，具体如下：

### readyState

|数值|	描述|
|--|--|
|0|	初始化,open()尚未调用|
|1|	open()已经调用，但是send未调用|
|2|	已获取到返回头信息|
|3|	正在下载返回体信息|
|4|	请求完成|

还有几个较为常用的属性



名称|含义
---|---
responseText|响应的文本
status|响应的状态码
statusText|响应的状态信息
responseXML|响应内容是“text/xml”或者是“application/xml”格式的时候，这个属性的值就是响应数据的XMLDOM文档。

我们用下面这段代码做个测试
```javascript
var xhr = new XMLHttpRequest();
console.log(xhr.readyState)
xhr.onreadystatechange = function(){
    console.log('------')
    console.log('readyState:' + xhr.readyState)
    console.log('ResponseHeaders:' + xhr.getAllResponseHeaders())
    console.log('ResponseText:' + xhr.responseText.length)
    console.log('------')
}
xhr.open('get','/')
xhr.send(null)
```
我们可以直观的看到在创建了XMLHttpRequest对象的时候，readyState的值为0。

![](/images/XMLHttpRequest1.png)

然后我们定义了onreadystatechange函数，让其打印一些属性，并调用open方法，此时readyState变为1。

![](/images/XMLHttpRequest2.png)

最后我们调用send方法，可以看到经历了如下过程：


![](/images/XMLHttpRequest3.png)


### abort()

取消响应，调用这个方法会终止已发送的请求。我们尝试在之前的代码最后加一句。

```javascript
xhr.abort();
console.log(xhr.readyState)；
```
![](/images/XMLHttpRequest4.png)

也就是说，send执行以后，并没有去尝试请求数据，而是直接取消掉了，并且我们发现abort会将readyState的值置为0。
除此之外，XMLHttpRequest还有一个很重要的属性withCredentials，cookie在同域请求的时候，会被自动携带在请求头中，但是跨域请求则不会，除非把withCredentials的值设为true（默认为false）。同时需要在服务端的响应头部中设置Access-Control-Allow-Credentials:true。不仅如此Access-Control-Allow-Origin的值也必须为当前页面的域名。


# 封装
到此为止，我们终于讲完了XMLHttpRequest的一些常用概念。接下来，我们尝试自己封装一个支持get和post的简易jax请求。

```javascript
function ajax(url, option){
    option = option || {};
    var method = (option.method || 'GET').toUpperCase(),
        async = option.async === undefined ? true : option.async,
        params = handleParams(option.data);
    var xhr = new XMLHttpRequest();
    if(async){
        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4){
               callback(option,xhr);
            }
        };
    }
    if (method === 'GET'){
        xhr.open("GET",url + '?' + params, async);
        xhr.send(null)
    }else if (method === 'POST'){
        xhr.open('POST', url, async);
        xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
        xhr.send(params);
    }
    if(!async){
        callback(option,xhr);
    }
    function callback(opt,obj){
        var status = obj.status;
        if (status >= 200 && status < 300 ){
            opt.success && opt.success(obj.responseText,obj.responseXML);
        }else{
            opt.fail && opt.fail(status);
        }
    }
    function handleParams(data) {  
        var arr = [];
        for (var i in data) {
            arr.push(encodeURIComponent(i) + '=' + encodeURIComponent(data[i]));
        }
        return arr.join('&');
    }
}
//  测试调用
ajax('/xxx',{
    method:'POST',
    data:{
        key: 'test'
    },
    success:function(){
        console.log('success')
    },
    fail:function(){
        console.log('fail')
    }
});

```

# 小结
其实ajax实现原理并不复杂，复杂的是容错、兼容性等的处理，使用的时候尽量使用库或者框架提供的封装，避免不必要的漏洞。