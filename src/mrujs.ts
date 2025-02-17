import { AJAX_EVENTS, dispatch, stopEverything } from './utils/events'
import { FormSubmitDispatcher } from './formSubmitDispatcher'
import { RemoteWatcher } from './remoteWatcher'
import { ClickHandler } from './clickHandler'
import { Csrf, getToken, getParam } from './csrf'
import { Confirm } from './confirm'
import { Method } from './method'
import { NavigationAdapter } from './navigationAdapter'
import { DisabledElementChecker } from './disabledElementChecker'
import { ElementEnabler, enableElement, enableFormElements, enableFormElement } from './elementEnabler'
import { ElementDisabler, disableElement } from './elementDisabler'
import { AddedNodesObserver } from './addedNodesObserver'
import { urlEncodeFormData } from './utils/form'

import { FetchRequest } from './http/fetchRequest'
import { addListeners, removeListeners, attachObserverCallback, BASE_SELECTORS } from './utils/dom'
import { BASE_ACCEPT_HEADERS } from './utils/headers'
import {
  MrujsConfigInterface,
  QuerySelectorInterface,
  MimeTypeInterface,
  CustomMimeTypeInterface,
  Locateable,
  ExtendedRequestInit,
  MrujsInterface
} from './types'

export function Mrujs (obj: Partial<MrujsInterface> = {}): MrujsInterface {
  obj.connected = false

  obj.addedNodesObserver = AddedNodesObserver(addedNodesCallback)
  obj.remoteWatcher = RemoteWatcher()
  obj.elementEnabler = ElementEnabler()
  obj.elementDisabler = ElementDisabler()
  obj.disabledElementChecker = DisabledElementChecker()
  obj.navigationAdapter = NavigationAdapter()
  obj.clickHandler = ClickHandler()
  obj.confirmClass = Confirm()
  obj.csrf = Csrf()
  obj.method = Method()
  obj.formSubmitDispatcher = FormSubmitDispatcher()

  // Order matters here!
  const corePlugins = [
    obj.addedNodesObserver,
    obj.remoteWatcher,
    obj.csrf,
    obj.elementEnabler,
    obj.clickHandler,
    obj.disabledElementChecker,
    obj.confirmClass,
    obj.elementDisabler,
    obj.method,
    obj.formSubmitDispatcher,
    obj.navigationAdapter
  ]

  obj.corePlugins = corePlugins

  const plugins = obj.plugins ?? []
  obj.plugins = plugins

  const allPlugins = corePlugins.concat(plugins)
  obj.allPlugins = allPlugins

  obj.config = {
    maskLinkMethods: true,
    querySelectors: { ...BASE_SELECTORS },
    mimeTypes: { ...BASE_ACCEPT_HEADERS },
    plugins
  }

  obj.confirm = confirm
  obj.start = start
  obj.stop = stop
  obj.restart = restart
  obj.fetch = fetch
  obj.urlEncodeFormData = urlEncodeFormData
  obj.registerMimeTypes = registerMimeTypes
  obj.enableElement = enableElement
  obj.enableFormElements = enableFormElements
  obj.enableFormElement = enableFormElement
  obj.disableElement = disableElement
  obj.stopEverything = stopEverything
  obj.dispatch = dispatch
  obj.addListeners = addListeners
  obj.removeListeners = removeListeners
  obj.attachObserverCallback = attachObserverCallback
  obj.appendToQuerySelector = appendToQuerySelector
  obj.registerConfirm = registerConfirm

  Object.defineProperties(obj, {
    csrfToken: { get: function (): string | undefined { return getToken() } },
    csrfParam: { get: function (): string | undefined { return getParam() } },
    querySelectors: {
      get: function (): QuerySelectorInterface { return this.config.querySelectors }
    },
    mimeTypes: {
      get: function (): MimeTypeInterface { return this.config.mimeTypes }
    }
  })

  return obj as MrujsInterface
}

function start (this: MrujsInterface, config: Partial<MrujsConfigInterface> = {}): MrujsInterface {
  window.Rails = window.mrujs = this

  // Dont start twice!
  if (window.mrujs.connected) {
    return window.mrujs
  }

  this.config = { ...this.config, ...config }
  this.plugins = this.config.plugins
  this.allPlugins = this.corePlugins.concat(this.plugins)

  for (let i = 0; i < this.allPlugins.length; i++) {
    const plugin = this.allPlugins[i]
    plugin.initialize?.()
  }

  connect()

  return this
}

function stop (): void {
  disconnect()
}

function restart (): void {
  disconnect()
  connect()
}

function connect (): void {
  // This event works the same as the load event, except that it fires every
  // time the page is loaded.
  // See https://github.com/rails/jquery-ujs/issues/357
  // See https://developer.mozilla.org/en-US/docs/Using_Firefox_1.5_caching
  reEnableDisabledElements()
  window.addEventListener('pageshow', reEnableDisabledElements)

  for (let i = 0; i < window.mrujs.allPlugins.length; i++) {
    const plugin = window.mrujs.allPlugins[i]
    plugin.connect?.()
  }

  window.mrujs.connected = true
}

function disconnect (): void {
  window.removeEventListener('pageshow', reEnableDisabledElements)

  for (let i = 0; i < window.mrujs.allPlugins.length; i++) {
    const plugin = window.mrujs.allPlugins[i]
    plugin.disconnect?.()
  }

  window.mrujs.connected = false
}

function confirm (message: string): boolean {
  return window.confirm(message)
}

function addedNodesCallback (this: MrujsInterface, mutationList: MutationRecord[], _observer: MutationObserver): void {
  for (const mutation of mutationList) {
    let addedNodes: Node[]

    if (mutation.type === 'attributes') {
      addedNodes = [mutation.target]
    } else {
      addedNodes = Array.from(mutation.addedNodes)
    }

    // kick it into an animation frame so we dont delay rendering
    window.setTimeout(() => {
      for (let i = 0; i < window.mrujs.allPlugins.length; i++) {
        const plugin = window.mrujs.allPlugins[i]
        plugin.observerCallback?.(addedNodes)
      }
    }, 0)
  }
}

function fetch (input: Request | Locateable, options: ExtendedRequestInit = {}): undefined | Promise<Response> {
  let { element, submitter, dispatchEvents } = options
  delete options.element
  delete options.submitter
  delete options.dispatchEvents

  const fetchRequest = FetchRequest(input, options)

  if (dispatchEvents === true) {
    if (element == null) element = document.documentElement

    dispatch.call(element, AJAX_EVENTS.ajaxBeforeSend, {
      detail: { element, fetchRequest, request: fetchRequest.request, submitter }
    })
    return undefined
  }

  return window.fetch(fetchRequest.request)
}

function registerMimeTypes (mimeTypes: CustomMimeTypeInterface[]): MimeTypeInterface {
  const customMimeTypes: MimeTypeInterface = {}

  mimeTypes.forEach((mimeType) => {
    const { shortcut, header } = mimeType
    customMimeTypes[shortcut] = header
  })

  window.mrujs.config.mimeTypes = {
    ...window.mrujs.config.mimeTypes,
    ...customMimeTypes
  }

  return window.mrujs.config.mimeTypes
}

function appendToQuerySelector (key: string, { selector, exclude }: { selector?: string, exclude?: string }): void {
  const { querySelectors } = window.mrujs
  if (Object.keys(querySelectors).includes(key)) {
    if (selector != null) {
      // @ts-expect-error
      // @eslint-ignore
      querySelectors[key].selector += `, ${selector}` // eslint-disable-line
    }
    if (exclude != null) {
      // @ts-expect-error
      querySelectors[key].exclude += `, ${exclude}` // eslint-disable-line
    }
  }
}

function registerConfirm (attribute: string, callback: Function): void {
  // click selectors
  appendToQuerySelector('buttonClickSelector', { selector: `a[${attribute}]` })
  appendToQuerySelector('linkClickSelector', { selector: `button[${attribute}]:not([form])` })

  // change selectors. Original only requires "[data-remote]" not sure about this.
  // const inputChangeSelector = ['select', 'input', 'textarea'].map((el) => `${el}[${attribute}]`).join(", ")
  // appendToQuerySelector('inputChangeSelector', { selector: inputChangeSelector })

  // submit selectors. Original only requires "form" not sure about this.
  // const formSubmitSelector = `form[${attribute}]`
  // appendToQuerySelector('formSubmitSelector', { selector: formSubmitSelector })

  window.mrujs?.confirmClass?.callbacks?.push(callback)
}

function reEnableDisabledElements (): void {
  const { formEnableSelector, linkDisableSelector } = window.mrujs.querySelectors

  document
    .querySelectorAll(`${formEnableSelector.selector}, ${linkDisableSelector.selector}`)
    .forEach(element => {
      const el = element as HTMLInputElement
      // Reenable any elements previously disabled
      enableElement(el)
    })
}
