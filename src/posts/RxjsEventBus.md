---
title: 通过Rxjs五行代码实现EventBus
date: 2018-07-28 12:30:32
tags: [rxjs, EventBus]
---
# 通过Rxjs五行代码实现EventBus
## 背景
消息传递是目前开发之中最常用的一个组件。没有之一。不同的消息传递方式各有千秋，但是不论如何。合适的 才是最好的。

在很大一部分系统中。消息的传递还没有复杂到需要各种类库去搞定。徒增新同学的上手成本。
可能需要监听和传递的数据只有几种，所以ngrx、ngxs、redux、mobx、vuex等库的引入只会带来额外的复杂度。所以用RXJS直接做一个BUS吧。

<!-- more -->
## EventBus
EventBus是一个事件发布/订阅框架，通过解耦发布者和订阅者简化事件传递。特别是在多层控制器嵌套的情况下。

EventBus最大的特点就是：简洁、解耦。在没有EventBus之前我们通常用广播来实现监听，或者自定义接口函数回调，比如ng1的$broadcast和$emit、VUE的$emit,和$on等。

![](/images/RxjsEventBus1.png)

图片摘自EventBus GitHub主页

![](/images/RxjsEventBus2.png)


## 废话少说  直接上代码
```typescript
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
@Injectable()
export class PubSubService {
  pub = new Subject<Event>();
  pub$ = this.pub.asObservable();
  publish(event: Event) {
    this.pub.next(event);
  }
}
export class Event {
  type: EventType;
  data: any;
}
export enum EventType {
  type1,
  type2
}
```
完成。。如果不算上定义类和枚举。一共五行代码。老铁没毛病吧。
## 使用方法
```typescript

  // 组件初始化的时候订阅
  initOnCompanyChange() {
    if (this.pubSubService.pub$.subscribe) {
      this.subscription = this.pubSubService.pub$.pipe(
        // 可以看到经过这个主题的所有数据
        tap(event => {
          console.log(`接收到数据`);
          console.log(event.data);
        }),
        // 我们只需要关心自己需要的类型的事件和数据
        filter(event => event.type === EventType.type1)
      ).subscribe(event => {
        // 拿到之后，就可以为所欲为了
        console.log(`接受到TYPE1数据：`);
        console.log(event.data);
      });
    }
  }

  // 发送类型为type1的事件和数据
  testChangeType1() {
    this.pubSubService.publish({
      type: EventType.type1,
      data: {
        key: '来了来了',
        value: 'ooooooo'
      }
    });
  }

  // 发送类型为type2的事件和数据
  testChangeType2() {
    this.pubSubService.publish({
      type: EventType.type2,
      data: {
        key: '又来了又来了',
        value: 'NNNNNN'
      }
    });
  }

  // 组件销毁的时候取消订阅，避免内存泄露
  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

```

文中的主题没有缓存的功能  如果需要 可以吧Subject 换成BehaviorSubject 具体可以看[Subject, BehaviorSubject, ReplaySubject, AsyncSubject](https://shaofeizi.github.io/BLOG/posts/rxjs23.html)



