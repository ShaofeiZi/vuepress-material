---
title: JavaScript 获取输入时的光标位置及场景问题
date: 2016-11-25 10:02:01
tags: [JavaScript, Range, Selection]
description: JavaScript 如何获取输入时的光标位置，在光标处插入或替换内容
---

## 前言

在输入编辑的业务场景中，可能会需要在光标当前的位置或附近显示提示选项。比如社交评论中的`@user`功能，要确保提示的用户列表总是出现在`@`字符右下方，又或者是在自定义编辑器中 autocomplete 语法提示，都需要获取光标当前的位置作为参照点。

<!-- more -->

## 两种位置

对于 WEB 开发来讲，当我们提到某某元素的位置，通常是指这个元素相对于父级或文档的像素单位坐标。而对于输入框中光标，就有了额外的区分。

### 相对于内容

相对于内容，光标位于第几个字符之后，姑且称之为**字符位置**吧。

### 相对于 UI

相对于 UI，也就是跟普通页面元素一样的**像素位置**了。

## 插入或替换内容

在前言提到的场景中，也有在光标位置处插入内容的需求，比如对选取文字加粗`text => <strong>text</strong>`等。

### textarea

`textarea`元素可以很容易获取到选择的一段文字的起止位置。如果当前没有选择文字，则两个位置值都为光标右侧字符的索引，从 0 开始。

```js
// 开始位置
textarea.selectionStart
// 结束位置
textarea.selectionEnd
```

对于加粗功能，有了起止位置，就能获取到选择的文字内容，然后对内容进行替换。由于`textarea`不能包含子元素，只有纯文本，所以基于`textarea`实现加粗只能像用 Markdown 标记语法实现。

```js
var selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd)
textarea.setRangeText('**' + selectedText + '**')
```

> `textarea.setRangeText(text: String)` 把选中的文字替换为其他内容。

### contenteditable

也可能我们会使用`contenteditable`属性把一个元素变为可编辑元素。而上面所用的属性和函数都是普通元素所没有的，所以要换一种姿势实现。

还是以加粗功能为例。

```js
// 获取文档中选中区域
var range = window.getSelection().getRangeAt(0)
var strongNode = document.createElement('strong')
// 选中区域文本
strongNode.innerHTML = range.toString()
// 删除选中区
range.deleteContents()
// 在光标处插入新节点
range.insertNode(strongNode)
```

基于`contenteditable`的可编辑元素，其中的内容均为子元素，文本为`textNode`，加粗使用 HTML 元素，插入或替换是对元素的操作。

如果想使用操作内容的思路实现会比较麻烦，因为可以获取到的起止位置是基于子元素的。

```html
<div contenteditable>hello<strong>你好</strong><big>w</big>orld</div>
```

假如选中的文字是`你好wor`，调用相关 API 的输出如下。

```js
// 当前在文档中选择的文本，document 和 window 都有这个函数
// var selection = document.getSelection()
var selection = window.getSelection()
selection.anchorNode // 你好
selection.anchorOffset // 0
selection.focusNode // orld
selection.focusOffset // 2

// 或者使用 Range
var range = selection.getRangeAt(0)
range.startContainer // 你好
range.startOffset // 0
range.endContainer // orld
range.endOffset // 2
```

最终可以获取到起止元素以及选中区域在开始元素内容中的字符位置和在结束元素内容中的字符位置。其中的起止元素均为`textNode`类型，通过`parentNode`获取到包裹元素。

```js
range.startContainer.parentNode // <strong>你好</strong>
range.endContainer.parentNode // <div contenteditable>...</div>
```

> 需要注意的是通过`Selection`和`Rang`获取到起止位置是有方向之分的，从左向右选择和从右向左选择得到的值是正好相反的。

## 基于光标像素位置创建内容

这里就要开始用像素位置，同样分为两种实现来讲。

### contenteditable

可编辑元素获取光标像素位置就像`textarea`获取光标的字符位置一样简单。

```js
var range = window.getSelection().getRangeAt(0)
range.getBoundingClientRect() // { width, height, top, right, bottom, right }
```

这么具体的尺寸值，实现自动完成真是 So easy!

### textarea

`textarea`其中的内容都是纯文本，在 DOM 中不存在相关的对象，对于像素位置就得另作他想了。

#### 基于行高和字体大小计算

```js
// 1.获取光标结束位置
var end = textarea.selectionEnd
// 2.通过匹配光标之前文本中的换行符计算所在行
var row = textarea.value.substring(0, end).match(/\r\n|\r|\n/).length
// 3.计算 top，行高 * 行数 + 上填充 + 边框宽度
var top = lineHeight * (row + 1) + paddingTop + borderWidth
// 4.获取光标左侧的文本
var leftText = textarea.value.split(/\r\n|\r|\n/)[row]
// 5.影响一段文字所占宽度的因素太多，除字体大小、中英文、符号、字符间距等，还有字体、浏览器、系统等客观因素
// var left = ...
```

这个方案的思路是没问题的，但是考虑所有问题的成本太高。虽然可以创建测试元素去计算文本宽度，但这个方案本身是从严谨的角度出发的。与其混在一块，直接用取巧的办法更简单。

> ~~这个方案的潜台词是：明明可以靠脸吃饭，却偏偏要靠才华！~~ 🙄

#### 镜像元素

文本不支持定位？那我创建 DOM 好了。

```js
// 光标位置
var end = textarea.selectionEnd
// 光标前的内容
var beforeText = textarea.value.slice(0, end)
// 光标后的内容
var afterText = textarea.value.slice(end)
// 对影响 UI 的特殊元素编码
var escape = function(text) {
  return text.replace(/<|>|`|"|&/g, '?').replace(/\r\n|\r|\n/g, '<br>')
}
// 创建镜像内容，复制样式
var mirror = '<div class="' + textarea.className + '">' + escape(beforeText) + '<span id="cursor">|</span>' + escape(afterText) + '</div>'
// 添加到 textarea 同级，注意设置定位及 zIndex，使两个元素重合
textarea.insertAdjacentHTML('afterend', mirror)
// 通过镜像元素中的假光标占位元素获取像素位置
var cursor = document.getElementById('cursor')
cursor.getBoundingClientRect() // { width, height, top, right, bottom, right }
```

## End

最后悄悄说一句，以上内容不兼容低版本 IE，但是 IE 毕竟主场运行，有些 API 反而是其他浏览器所没有的。就上面提到的案例来说，低版本 IE 也有对应的 API 可用。真是不想在 IE 上去浪费精力了，索性不提。
