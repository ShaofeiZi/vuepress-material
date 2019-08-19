---
title: 渲染DOM元素
date: 2019-08-18 17:05:53
tags: [React]
---
# 1.渲染DOM元素
> 让我们开始一步步构建自己的React。
## 1.1 DOM审查
在我们开始之前，让我们回顾一下我们将使用的DOM API：
```JavaScript
// 根据ID获取对应元素
const domRoot = document.getElementById("root");
// 根据标签名创建一个对应的新元素
const domInput = document.createElement("input");
// 设置属性
domInput["type"] = "text";
domInput["value"] = "Hi world";
domInput["className"] = "my-class";
// 监听事件
domInput.addEventListener("change", e => alert(e.target.value));
// 创建文本节点
const domText = document.createTextNode("");
// 设置文本节点内容
domText["nodeValue"] = "Foo";
// 增加元素
domRoot.appendChild(domInput);
// 增加文本节点（与之前相同）
domRoot.appendChild(domText);
```
请注意，我们正在设置[元素属性而不是属性](https://stackoverflow.com/questions/6003819/what-is-the-difference-between-properties-and-attributes-in-html)。这意味着只允许有效的属性。

## 1.2 FReact 元素

我们用原生的JS对象来描述需要渲染的东西。就叫他FReact Elements。

这些元素有两个必需的属性：`type`和`props`。

* `type`可以是一个 __{字符串string}__  或一个 __{函数function}__, 但我们将只使用 __字符__，直到我们在稍后的帖子中引入 __组件__。

* `props`是可以为空的对象（但不为空）。props可能有一个`children`属性，它应该是一个`FReact`元素的数组。
> 我们会很多地使用FReact Elements，所以从现在开始我们只会称它们为 __{元素element}__, 不要与HTML element混淆.


例如，像这样的一个元素：
```JavaScript
const element = {
  type: "div",
  props: {
    id: "container",
    children: [
      { type: "input", props: { value: "foo", type: "text" } },
      { type: "a", props: { href: "/bar" } },
      { type: "span", props: {} }
    ]
  }
};
```

描述这个dom:
```JavaScript
<div id="container">
  <input value="foo" type="text">
  <a href="/bar"></a>
  <span></span>
</div>
```
***
FReact-元素与React-元素非常相似。

但是通常你在使用React时不会创建React-元素作为JS对象，

你可能使用JSX或者甚至是createElement。

我们将在FReact中做同样的事情，但我们将会在系列下一篇文章中描述 `createElement` 的代码。
***

## 1.3 渲染-DOM-元素
下一步是将元素及其子元素呈现给dom。

我们将使用一个render函数（相当于ReactDOM.render）接收一个元素和一个dom容器。

该函数应该创建由element定义的dom子树并将其附加到容器中：

```JavaScript
function render(element, parentDom) {
  const { type, props } = element; // 获取类型 和 属性对象
  const dom = document.createElement(type); // 创建-类型-element
  const childElements = props.children || []; // 获取-孩子
  childElements.forEach(childElement => render(childElement, dom)); // 每个孩子 都要加入-爸爸妈妈-的怀抱
  //
  parentDom.appendChild(dom); // 爸爸妈妈加入爷爷奶奶的怀抱
}
```

我们仍然缺少属性和事件监听器。让我们props用Object.keys函数迭代属性名称并相应地-设置-它们：

```JavaScript
function render(element, parentDom) {
  const { type, props } = element;
  const dom = document.createElement(type);

  const isListener = name => name.startsWith("on");
  // 是否开头-on
  Object.keys(props).filter(isListener).forEach(name => {
    const eventType = name.toLowerCase().substring(2); // 取两位后
    dom.addEventListener(eventType, props[name]);
  });
  // 每一个开头-on 的属性-对应-函数 props[name] - >用-dom-addEvent 接连

  const isAttribute = name => !isListener(name) && name != "children";
  // 不是-监听事件 和 不能是-孩子

  Object.keys(props).filter(isAttribute).forEach(name => {
    dom[name] = props[name];
  });
 // 过滤出来的属性 - 赋予 - > dom
  const childElements = props.children || [];
  childElements.forEach(childElement => render(childElement, dom));

  parentDom.appendChild(dom);
}
```

## 1.4 渲染DOM文本节点
`render`函数不支持的一件事是文本节点。首先，我们需要定义文本元素的外观。例如，<span>Foo</span>在React中描述的元素如下所示：

```JavaScript
const reactElement = {
  type: "span",
  props: {
    children: ["Foo"] // 是孩子, 但也只是一个字符串
  }
};
```
请注意，`children`，只是一个字符串 ，而不是另一个元素对象。

这违背了我们如何定义FReact元素：children应该是元素的数组和所有元素应该有type和props。

如果我们遵循这些规则，我们将来会少一些if判断。

因此，FReact Text Elements将type==“TEXT ELEMENT”相等，实际文本将位于nodeValue属性中。

就像：
```JavaScript
const textElement = {
  type: "span",
  props: {
    children: [
      {
        type: "TEXT ELEMENT", // 1
        props: { nodeValue: "Foo" } // 2
      }
    ]
  }
```

现在我们已经规范了文本元素的数据结构，我们需要可以呈现它, 以便与其他元素一样，而区别也就是`{type: "TEXT ELEMENT"}`。
我们应该使用`createTextNode`，而不是使用`createElement`。

就是这样，`nodeValue`将会像其他属性一样设置。

```JavaScript
function render(element, parentDom) {
  const { type, props } = element;

  // 创建DOM元素
  const isTextElement = type === "TEXT ELEMENT"; // 文本类型判定
  const dom = isTextElement
    ? document.createTextNode("")
    : document.createElement(type);

  // 增加事件监听
  const isListener = name => name.startsWith("on");
  Object.keys(props).filter(isListener).forEach(name => {
    const eventType = name.toLowerCase().substring(2);
    dom.addEventListener(eventType, props[name]);
  });

  // 设置属性
  const isAttribute = name => !isListener(name) && name != "children";
  Object.keys(props).filter(isAttribute).forEach(name => {
    dom[name] = props[name];
  });

  // 渲染子节点
  const childElements = props.children || [];
  childElements.forEach(childElement => render(childElement, dom));

  // 增加到父节点
  parentDom.appendChild(dom);
}
```

# 1.5 概要

我们创建了一个`render`函数，允许我们将一个元素`{element}`及其子元素`{children}`呈现给DOM `parentDom.appendChild(dom)`。

接下来我们需要的是`createElement`的简单方法。

我们将在下一篇文章中做到这一点，在那里我们将让JSX与FReact一起工作。

如果您想尝试我们迄今为止编写的代码，请检查[codepen](https://codepen.io/shaofeizi/pen/oNvLRwm).你也可以从github回购中检查这个差异。

