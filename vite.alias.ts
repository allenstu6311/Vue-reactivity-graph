import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export const alias = {
  '@': resolve(__dirname, 'src'),
}
