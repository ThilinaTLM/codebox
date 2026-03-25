//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  { ignores: ["src/components/ui/**"] },
  ...tanstackConfig,
]
