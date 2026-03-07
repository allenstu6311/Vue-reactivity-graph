export function devLog(...args: unknown[]) {
  chrome.devtools.inspectedWindow.eval(
    `console.log('[panel]', ...${JSON.stringify(args)})`,
  )
}
