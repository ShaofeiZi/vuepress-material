---
title: 解密 angular 双向绑定
date: 2018-07-08 22:15:53
tags: [angular,双向绑定]
---
Angular 的双向绑定与 AngularJS 的双向绑定工作原理是完全不同的，目前看起来是没有 AngularJS 会遇到性能问题。那 Angular 的双向绑定到底是怎么工作的呢?

<!-- more -->
## 如何使用 双向绑定 (Two-way Binding)
以下的三种写法都可以达到双向绑定的效果
### 方法1

使用 `[()]` 的写法
```typescript
<input [(ngModel)]="username">

<p>Hello {{username}}!</p>
```
### 方法2

将 `[]` `()` 分开写
```typescript
<input [ngModel]="username" (ngModelChange)="username = $event">

<p>Hello {{username}}!</p>
```
### 方法3

不使用 ngModel

```typescript
<input [value]="username" (input)="username = $event.target.value">

<p>Hello {{username}}!</p>
```
##  [()] 的秘密

我们知道 `[()]` 是 Angular 所提供给双向绑定的语法糖，但是底层到底是怎么工作的，为什么会可以转换成 `[<name>]` +`(<name>Change)` 呢? 以下简单说明

- `compiler/src/template_parser/template_parser.ts` 里面会去分析 Element 的 attribute 是否有符合各种格式的内容
```typescript {19}
const BIND_NAME_REGEXP =
    /^(?:(?:(?:(bind-)|(let-)|(ref-|#)|(on-)|(bindon-)|(@))(.+))|\[\(([^\)]+)\)\]|\[([^\]]+)\]|\(([^\)]+)\))$/;

// Group 1 = "bind-"
const KW_BIND_IDX = 1;
// Group 2 = "let-"
const KW_LET_IDX = 2;
// Group 3 = "ref-/#"
const KW_REF_IDX = 3;
// Group 4 = "on-"
const KW_ON_IDX = 4;
// Group 5 = "bindon-"
const KW_BINDON_IDX = 5;
// Group 6 = "@"
const KW_AT_IDX = 6;
// Group 7 = the identifier after "bind-", "let-", "ref-/#", "on-", "bindon-" or "@"
const IDENT_KW_IDX = 7;
// Group 8 = identifier inside [()]
const IDENT_BANANA_BOX_IDX = 8;
// Group 9 = identifier inside []
const IDENT_PROPERTY_IDX = 9;
// Group 10 = identifier inside ()
const IDENT_EVENT_IDX = 10;
```
```typescript {46}
 private _parseAttr(
      isTemplateElement: boolean, attr: html.Attribute, targetMatchableAttrs: string[][],
      targetProps: ParsedProperty[], targetEvents: t.BoundEventAst[],
      targetRefs: ElementOrDirectiveRef[], targetVars: t.VariableAst[]): boolean {
    const name = this._normalizeAttributeName(attr.name);
    const value = attr.value;
    const srcSpan = attr.sourceSpan;

    const boundEvents: ParsedEvent[] = [];
    const bindParts = name.match(BIND_NAME_REGEXP);
    let hasBinding = false;

    if (bindParts !== null) {
      hasBinding = true;
      if (bindParts[KW_BIND_IDX] != null) {
        this._bindingParser.parsePropertyBinding(
            bindParts[IDENT_KW_IDX], value, false, srcSpan, targetMatchableAttrs, targetProps);

      } else if (bindParts[KW_LET_IDX]) {
        if (isTemplateElement) {
          const identifier = bindParts[IDENT_KW_IDX];
          this._parseVariable(identifier, value, srcSpan, targetVars);
        } else {
          this._reportError(`"let-" is only supported on ng-template elements.`, srcSpan);
        }

      } else if (bindParts[KW_REF_IDX]) {
        const identifier = bindParts[IDENT_KW_IDX];
        this._parseReference(identifier, value, srcSpan, targetRefs);

      } else if (bindParts[KW_ON_IDX]) {
        this._bindingParser.parseEvent(
            bindParts[IDENT_KW_IDX], value, srcSpan, targetMatchableAttrs, boundEvents);

      } else if (bindParts[KW_BINDON_IDX]) {
        this._bindingParser.parsePropertyBinding(
            bindParts[IDENT_KW_IDX], value, false, srcSpan, targetMatchableAttrs, targetProps);
        this._parseAssignmentEvent(
            bindParts[IDENT_KW_IDX], value, srcSpan, targetMatchableAttrs, boundEvents);

      } else if (bindParts[KW_AT_IDX]) {
        this._bindingParser.parseLiteralAttr(
            name, value, srcSpan, targetMatchableAttrs, targetProps);

      } else if (bindParts[IDENT_BANANA_BOX_IDX]) {
        this._bindingParser.parsePropertyBinding(
            bindParts[IDENT_BANANA_BOX_IDX], value, false, srcSpan, targetMatchableAttrs,
            targetProps);
        this._parseAssignmentEvent(
            bindParts[IDENT_BANANA_BOX_IDX], value, srcSpan, targetMatchableAttrs, boundEvents);

      } else if (bindParts[IDENT_PROPERTY_IDX]) {
        this._bindingParser.parsePropertyBinding(
            bindParts[IDENT_PROPERTY_IDX], value, false, srcSpan, targetMatchableAttrs,
            targetProps);

      } else if (bindParts[IDENT_EVENT_IDX]) {
        this._bindingParser.parseEvent(
            bindParts[IDENT_EVENT_IDX], value, srcSpan, targetMatchableAttrs, boundEvents);
      }
    } else {
      hasBinding = this._bindingParser.parsePropertyInterpolation(
          name, value, srcSpan, targetMatchableAttrs, targetProps);
    }

    if (!hasBinding) {
      this._bindingParser.parseLiteralAttr(name, value, srcSpan, targetMatchableAttrs, targetProps);
    }

    targetEvents.push(...boundEvents.map(e => t.BoundEventAst.fromParsedEvent(e)));

    return hasBinding;
  }
```

 - 根据 `_parseAssigmentEvent` 就会将部分`[(ngModel)]="username"` 转换成 `(ngModelChange)="username = $event"` 传入 `bindingParser.parseEvent` 的方法内
 ```typescript
 
  private _parseAssignmentEvent(
      name: string, expression: string, sourceSpan: ParseSourceSpan,
      targetMatchableAttrs: string[][], targetEvents: ParsedEvent[]) {
    this._bindingParser.parseEvent(
        `${name}Change`, `${expression}=$event`, sourceSpan, targetMatchableAttrs, targetEvents);
  }
 ```

 -  `this._bindingParse.parseEvent`，会更新 Element 的属性值
 路径在 
 `compiler/src/template_parser/binding_parser.ts`
 ```typescript
 parseEvent(
      name: string, expression: string, sourceSpan: ParseSourceSpan,
      targetMatchableAttrs: string[][], targetEvents: ParsedEvent[]) {
    if (isAnimationLabel(name)) {
      name = name.substr(1);
      this._parseAnimationEvent(name, expression, sourceSpan, targetEvents);
    } else {
      this._parseRegularEvent(name, expression, sourceSpan, targetMatchableAttrs, targetEvents);
    }
  }
 ```
 - 这就是 `[()]` 语法糖的工作方式

## ngModel
`ngModel` 是 Angular 所提供的 Directive，主要用途是用来简化双向绑定的写法，代码可以[看这里](https://github.com/angular/angular/blob/master/packages/forms/src/directives/ng_model.ts)

### 代码说明
- ngOnChanges
第一次 Input Change 时，注册 Control 等相关事件，注册流程如下
1. 检查是否有注册过，如果没有，执行 `_setUpControl` 的方法，`setUpControl`是在 `forms/src/directives/shared.ts` 内实现的，主要功能是 `Control` 的事件注册。
```typescript
ngOnChanges(changes: SimpleChanges) {
    this._checkForErrors();
    if (!this._registered) this._setUpControl();
    if ('isDisabled' in changes) {
        this._updateDisabled(changes);
    }

    if (isPropertyUpdated(changes, this.viewModel)) {
        this._updateValue(this.model);
        this.viewModel = this.model;
    }
}
...
private _setUpControl(): void {
    this._isStandalone() ? this._setUpStandalone() :
                        this.formDirective.addControl(this);
    this._registered = true;
}

private _isStandalone(): boolean {
    return !this._parent || !!(this.options && this.options.standalone);
}

private _setUpStandalone(): void {
    setUpControl(this._control, this); 
    this._control.updateValueAndValidity({emitEvent: false});
}
```

- `setUpControl` 内有许多事件注册行为，而跟双向绑定有关的事件是 `dir.valueAccessor!.registerOnChange`，这里会传入一个回调函数
```typescript{12}
export function setUpControl(control: FormControl, dir: NgControl): void {
  if (!control) _throwError(dir, 'Cannot find control with');
  if (!dir.valueAccessor) _throwError(dir, 'No value accessor for form control with');

  control.validator = Validators.compose([control.validator !, dir.validator]);
  control.asyncValidator = Validators.composeAsync([control.asyncValidator !, dir.asyncValidator]);
  dir.valueAccessor !.writeValue(control.value);

  setUpViewChangePipeline(control, dir);
  setUpModelChangePipeline(control, dir);

  setUpBlurPipeline(control, dir);

  if (dir.valueAccessor !.setDisabledState) {
    control.registerOnDisabledChange(
        (isDisabled: boolean) => { dir.valueAccessor !.setDisabledState !(isDisabled); });
  }

  // re-run validation when validator binding changes, e.g. minlength=3 -> minlength=4
  dir._rawValidators.forEach((validator: Validator | ValidatorFn) => {
    if ((<Validator>validator).registerOnValidatorChange)
      (<Validator>validator).registerOnValidatorChange !(() => control.updateValueAndValidity());
  });

  dir._rawAsyncValidators.forEach((validator: AsyncValidator | AsyncValidatorFn) => {
    if ((<Validator>validator).registerOnValidatorChange)
      (<Validator>validator).registerOnValidatorChange !(() => control.updateValueAndValidity());
  });
}
```
```typescript
function setUpViewChangePipeline(control: FormControl, dir: NgControl): void {
  dir.valueAccessor !.registerOnChange((newValue: any) => {
    control._pendingValue = newValue;
    control._pendingChange = true;
    control._pendingDirty = true;
    // 触发更新
    if (control.updateOn === 'change') updateControl(control, dir); 
  });
}
function updateControl(control: FormControl, dir: NgControl): void {
  dir.viewToModelUpdate(control._pendingValue);
  if (control._pendingDirty) control.markAsDirty();
  control.setValue(control._pendingValue, {emitModelToViewChange: false});
}
```
- 而当 Input 栏位有资料输入时，就会触发事件并将回传值发送到到页面上
`ng_model.ts`
```typescript
viewToModelUpdate(newValue: any): void {
    this.viewModel = newValue;
    this.update.emit(newValue);
}
```
### NG_VALUE_ACCESSOR
这个 provider 是让 `ngModleChange` 接受 `$event` 而不是 `$event.target.value` 的
![](/images/angularTwoWayBinding.png)

在各类型的 `Control` 都会有一份 `NG_VALUE_ACCESSOR` ，而针对 `ngModel` 我们需留意的是 `DEFAULT_VALUE_ACCESSOR` ，代码在 `default_value_accessor.ts`

::: tip
使用 multi 的 DI 方式并不是这篇文章的重点，只要知道这样子写，可以让 Provider 使用同一个名称但又可同时存在不互相影响
:::

```typescript
export const DEFAULT_VALUE_ACCESSOR: any = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => DefaultValueAccessor),
  multi: true
};
```
```typescript
@Directive({
  selector:
      'input:not([type=checkbox])[formControlName],textarea[formControlName],input:not([type=checkbox])[formControl],textarea[formControl],input:not([type=checkbox])[ngModel],textarea[ngModel],[ngDefaultControl]',
  host: {
    '(input)': '_handleInput($event.target.value)',
    '(blur)': 'onTouched()',
    '(compositionstart)': '_compositionStart()',
    '(compositionend)': '_compositionEnd($event.target.value)'
  },
  providers: [DEFAULT_VALUE_ACCESSOR]
})
export class DefaultValueAccessor implements ControlValueAccessor {  
  onChange = (_: any) => {};
  onTouched = () => {};

  /** Whether the user is creating a composition string (IME events). */
  private _composing = false;

  constructor(
      private _renderer: Renderer, private _elementRef: ElementRef,
      @Optional() @Inject(COMPOSITION_BUFFER_MODE) private _compositionMode: boolean) {
    if (this._compositionMode == null) {
      this._compositionMode = !_isAndroid();
    }
  }

  writeValue(value: any): void {
    const normalizedValue = value == null ? '' : value;
    this._renderer.setElementProperty(this._elementRef.nativeElement, 'value', normalizedValue);
  }

  registerOnChange(fn: (_: any) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  ...

  _handleInput(value: any): void {
    if (!this._compositionMode || (this._compositionMode && !this._composing)) {
      this.onChange(value);
    }
  }

  ...
}
```

`DefaultValueAccessor` 里 `registerOnChange` 与 `onChange` 的关系是，`ngModel` 会经 `setUpControl` 的方法将自订方法通过 `registerOnChange` 注册到 `onChange` 上，

`DefaultValueAccessor` 的 `@Directive` 的地方，有注册 `(input)` 事件发生时会触发的方法， `_handleInput($event.target.value)`

```typescript
_handleInput(value: any): void {
    if (!this._compositionMode || (this._compositionMode && !this._composing)) {
        this.onChange(value);
    }
}
```

经过这一串的折腾，魔法就出现了，`ngModle` 的 `@Output('ngModelChange')` 会收到并发送资料到页面上，这也就是为什么 `(ngModelChange)` 的 `$event` 不需要加上 target.value，又可以取得数据
## 划重点

以下是双向绑定相关的流程顺序

1.  `[ngModel]`时会触发 `ngOnChanges` 事件
2.  在 `ngOnChanges` 时，会执行 `setUpControl()` 方法
3.  在 `setupControl()` 内会注册 `DefaultValueAccess` 执行 `registerOnChange`，并将 callback function 传入
4.  通过 `registerOnChanges` 传入的 callback function 会被绑定到 `onChanges` 上
5.  当 `(input)` 事件被触发时，会执行 `_handleInput($event.target.value)` 的方法
6.  将传入 `_handleInput(value)` 的值传给注册在 `onChange` 的 callback function
7.  callback function 会执行 `ngModel` 里的 `viewToModelUpdate(newValue)` 方法
8.  最后将 `viewToModelUpdate` 所接受到的值，透过 `ngModelChange` 的 EventEmiiter emit 传到页面上
9.  完成整个双向绑定的动作