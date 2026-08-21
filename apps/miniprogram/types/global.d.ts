declare const wx: any

declare function App(options: any): void
declare function Page(options: any): void
declare function Component(options: any): void
declare function getApp<T = any>(): T
declare function getCurrentPages(): any[]

declare function setTimeout(handler: (...args: any[]) => void, timeout?: number): number
declare function clearTimeout(handle?: number | null): void
declare function setInterval(handler: (...args: any[]) => void, timeout?: number): number
declare function clearInterval(handle?: number | null): void

declare interface AppGlobalData {
  bootstrapped: boolean
}
