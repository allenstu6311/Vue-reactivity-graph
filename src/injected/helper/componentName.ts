import type { ComponentInternalInstance } from 'vue'

/**
 * Extract the base filename from a file path, handling Windows drive letters.
 * Aligned with @vue/devtools-shared general.ts:30
 *
 * @param filename File path (may include Windows drive letter like C:\)
 * @param ext File extension to remove (e.g. '.vue')
 * @returns Basename without extension and drive letter
 */
function basename(filename: string, ext: string): string {
  let normalizedFilename = filename.replace(/^[a-z]:/i, '').replace(/\\/g, '/')
  if (normalizedFilename.endsWith(`index${ext}`)) {
    normalizedFilename = normalizedFilename.replace(`/index${ext}`, ext)
  }
  const lastSlashIndex = normalizedFilename.lastIndexOf('/')
  const baseNameWithExt = normalizedFilename.substring(lastSlashIndex + 1)
  if (ext) {
    const extIndex = baseNameWithExt.lastIndexOf(ext)
    return baseNameWithExt.substring(0, extIndex)
  }
  return ''
}

/**
 * Convert a string to PascalCase.
 * Aligned with @vue/devtools-shared general.ts:14
 * Uppercases the first letter after start, hyphens, underscores, or slashes.
 *
 * @param str Input string
 * @returns PascalCase string
 */
function classify(str: string): string {
  const classifyRE = /(?:^|[-_/])(\w)/g
  return str && (`${str}`).replace(classifyRE, (_, c: string) => c ? c.toUpperCase() : '')
}

/**
 * Get the component type name from component options/function.
 * Handles both function components (displayName/name) and object components (name/_componentTag/__name).
 * Applies index.vue special case: if name or __name is 'index' and __file ends with 'index.vue',
 * treat as empty string to continue fallback.
 *
 * @param instance Component instance
 * @returns Component type name or empty string if none found
 */
function getComponentTypeName(instance: ComponentInternalInstance | null | undefined): string {
  if (!instance) return ''

  const type = instance.type as any

  // Function component: displayName → name
  if (typeof type === 'function') {
    return type.displayName || type.name || ''
  }

  // Object component: name → _componentTag → __name
  // Apply index.vue special case to both name and __name
  const name = type.name
  if (name && !(name === 'index' && type.__file?.endsWith('index.vue'))) {
    return name
  }

  const componentTag = type._componentTag
  if (componentTag && !(componentTag === 'index' && type.__file?.endsWith('index.vue'))) {
    return componentTag
  }

  const vName = type.__name
  if (vName && !(vName === 'index' && type.__file?.endsWith('index.vue'))) {
    return vName
  }

  return ''
}

/**
 * Get the display name for a component instance.
 * Implements complete fallback chain aligned with Vue DevTools:
 * 1. getComponentTypeName (displayName/name for functions, name/_componentTag/__name for objects)
 * 2. 'Root' if instance.root === instance
 * 3. Reverse lookup in instance.parent?.type?.components
 * 4. Reverse lookup in instance.appContext?.components
 * 5. classify(basename(instance.type.__file, '.vue'))
 * 6. 'Anonymous Component'
 *
 * @param instance Component instance (accepts nullish)
 * @returns Display name string
 */
export function getInstanceName(instance: ComponentInternalInstance | null | undefined): string {
  // Step 1: Try getComponentTypeName (includes displayName, name, _componentTag, __name with index.vue special case)
  const typeName = getComponentTypeName(instance)
  if (typeName) {
    return typeName
  }

  if (!instance) {
    return 'Anonymous Component'
  }

  // Step 2: Root instance check
  if (instance.root === instance) {
    return 'Root'
  }

  // Step 3: Reverse lookup in parent's local components
  const parentComponents = (instance.parent?.type as any)?.components
  if (parentComponents) {
    for (const key in parentComponents) {
      if (parentComponents[key] === instance.type) {
        return key
      }
    }
  }

  // Step 4: Reverse lookup in app's global components
  const appComponents = instance.appContext?.components
  if (appComponents) {
    for (const key in appComponents) {
      if (appComponents[key] === instance.type) {
        return key
      }
    }
  }

  // Step 5: Fallback to filename-based name
  const file = (instance.type as any)?.__file
  if (file) {
    return classify(basename(file, '.vue'))
  }

  // Step 6: Last resort
  return 'Anonymous Component'
}
