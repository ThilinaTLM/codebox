const ADJECTIVES = [
  "amber", "azure", "bold", "brave", "bright",
  "calm", "clear", "cool", "coral", "crisp",
  "dark", "deep", "eager", "fair", "fast",
  "fleet", "fond", "fresh", "glad", "gold",
  "grand", "green", "hazy", "icy", "jade",
  "keen", "kind", "lush", "mild", "misty",
  "neat", "noble", "pale", "prime", "pure",
  "quick", "quiet", "rapid", "rare", "rich",
  "sharp", "silver", "sleek", "soft", "steel",
  "still", "swift", "teal", "vast", "warm",
  "wild", "wise", "vivid", "lunar", "solar",
]

const NOUNS = [
  "arrow", "badger", "beacon", "brook", "cedar",
  "cliff", "cloud", "crane", "creek", "crow",
  "dune", "eagle", "elm", "ember", "falcon",
  "fern", "finch", "flame", "flint", "forge",
  "frost", "grove", "hawk", "heron", "hill",
  "lark", "leaf", "lynx", "maple", "marsh",
  "mesa", "moss", "oak", "otter", "peak",
  "pine", "pond", "raven", "reef", "ridge",
  "river", "robin", "sage", "shore", "sky",
  "spark", "stone", "storm", "trail", "vale",
  "wave", "wren", "wolf", "canyon", "harbor",
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateReadableName(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`
}
