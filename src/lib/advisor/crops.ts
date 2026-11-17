import copy from '../../i18n/en.json'

export type CropCategory = 'cereal' | 'legume' | 'root' | 'vegetable' | 'cash'
export type Warmth = 'cool' | 'mild' | 'warm' | 'hot'
export type Drought = 'delicate' | 'sensitive' | 'moderate' | 'hardy'
export type CropMethod = 'seed' | 'transplant' | 'cutting'

export type Crop = {
  id: string
  name: string
  aliases: string[]
  category: CropCategory
  warmth: Warmth
  drought: Drought
  method: CropMethod
  daysToHarvest: number
  emoji?: string
}

export type CropThresholds = {
  minSoilTempC: number
  heatStressMaxC: number
  maxDrySpellDays: number
  onsetRainMm: number
}

type CropDefinition = Omit<Crop, 'name'>

// Crop classes and values are illustrative defaults for an agronomist to review.
const definitions: CropDefinition[] = [
  { id: 'maize', category: 'cereal', warmth: 'mild', drought: 'sensitive', method: 'seed', daysToHarvest: 120, aliases: ['mealies', 'corn', 'mahindi', 'chimanga'], emoji: '🌽' },
  { id: 'sorghum', category: 'cereal', warmth: 'warm', drought: 'moderate', method: 'seed', daysToHarvest: 115, aliases: ['mabele', 'mtama', 'guinea corn'] },
  { id: 'pearl-millet', category: 'cereal', warmth: 'warm', drought: 'hardy', method: 'seed', daysToHarvest: 90, aliases: ['mahangu', 'bajra'] },
  { id: 'finger-millet', category: 'cereal', warmth: 'warm', drought: 'moderate', method: 'seed', daysToHarvest: 120, aliases: ['ulezi', 'rapoko'] },
  { id: 'upland-rice', category: 'cereal', warmth: 'warm', drought: 'sensitive', method: 'seed', daysToHarvest: 120, aliases: ['rice'] },
  { id: 'teff', category: 'cereal', warmth: 'mild', drought: 'moderate', method: 'seed', daysToHarvest: 100, aliases: [] },
  { id: 'common-beans', category: 'legume', warmth: 'mild', drought: 'sensitive', method: 'seed', daysToHarvest: 85, aliases: ['maharage', 'sugar beans'], emoji: '🫘' },
  { id: 'cowpeas', category: 'legume', warmth: 'hot', drought: 'moderate', method: 'seed', daysToHarvest: 75, aliases: ['black-eyed peas', 'kunde', 'niébé'] },
  { id: 'groundnuts', category: 'legume', warmth: 'hot', drought: 'moderate', method: 'seed', daysToHarvest: 120, aliases: ['peanuts', 'karanga', 'nzungu'], emoji: '🥜' },
  { id: 'soybeans', category: 'legume', warmth: 'mild', drought: 'sensitive', method: 'seed', daysToHarvest: 115, aliases: ['soya'] },
  { id: 'pigeon-peas', category: 'legume', warmth: 'warm', drought: 'hardy', method: 'seed', daysToHarvest: 180, aliases: ['mbaazi'] },
  { id: 'bambara-groundnuts', category: 'legume', warmth: 'hot', drought: 'hardy', method: 'seed', daysToHarvest: 130, aliases: ['jugo beans', 'nyimo'] },
  { id: 'cassava', category: 'root', warmth: 'hot', drought: 'hardy', method: 'cutting', daysToHarvest: 300, aliases: ['manioc', 'muhogo'] },
  { id: 'sweet-potatoes', category: 'root', warmth: 'warm', drought: 'moderate', method: 'cutting', daysToHarvest: 130, aliases: ['viazi vitamu'], emoji: '🍠' },
  { id: 'potatoes', category: 'root', warmth: 'cool', drought: 'sensitive', method: 'cutting', daysToHarvest: 100, aliases: ['irish potatoes', 'viazi'], emoji: '🥔' },
  { id: 'yams', category: 'root', warmth: 'hot', drought: 'moderate', method: 'cutting', daysToHarvest: 240, aliases: [] },
  { id: 'tomatoes', category: 'vegetable', warmth: 'warm', drought: 'delicate', method: 'transplant', daysToHarvest: 80, aliases: ['nyanya'], emoji: '🍅' },
  { id: 'onions', category: 'vegetable', warmth: 'cool', drought: 'delicate', method: 'transplant', daysToHarvest: 120, aliases: ['kitunguu'], emoji: '🧅' },
  { id: 'cabbage', category: 'vegetable', warmth: 'cool', drought: 'delicate', method: 'transplant', daysToHarvest: 85, aliases: [] },
  { id: 'kale', category: 'vegetable', warmth: 'cool', drought: 'delicate', method: 'seed', daysToHarvest: 55, aliases: ['sukuma wiki'] },
  { id: 'spinach', category: 'vegetable', warmth: 'cool', drought: 'delicate', method: 'seed', daysToHarvest: 55, aliases: ['swiss chard'] },
  { id: 'amaranth', category: 'vegetable', warmth: 'warm', drought: 'sensitive', method: 'seed', daysToHarvest: 35, aliases: ['mchicha', 'terere'] },
  { id: 'okra', category: 'vegetable', warmth: 'hot', drought: 'moderate', method: 'seed', daysToHarvest: 60, aliases: ['bamia', 'gombo', "lady's fingers"] },
  { id: 'pumpkin', category: 'vegetable', warmth: 'warm', drought: 'sensitive', method: 'seed', daysToHarvest: 105, aliases: [], emoji: '🎃' },
  { id: 'butternut', category: 'vegetable', warmth: 'warm', drought: 'sensitive', method: 'seed', daysToHarvest: 95, aliases: [] },
  { id: 'chillies-peppers', category: 'vegetable', warmth: 'warm', drought: 'delicate', method: 'transplant', daysToHarvest: 85, aliases: ['pilipili', 'piri-piri'] },
  { id: 'carrots', category: 'vegetable', warmth: 'cool', drought: 'delicate', method: 'seed', daysToHarvest: 80, aliases: [], emoji: '🥕' },
  { id: 'watermelon', category: 'vegetable', warmth: 'hot', drought: 'moderate', method: 'seed', daysToHarvest: 90, aliases: [], emoji: '🍉' },
  { id: 'sunflower', category: 'cash', warmth: 'mild', drought: 'moderate', method: 'seed', daysToHarvest: 105, aliases: [], emoji: '🌻' },
  { id: 'cotton', category: 'cash', warmth: 'hot', drought: 'moderate', method: 'seed', daysToHarvest: 165, aliases: [] },
  { id: 'sesame', category: 'cash', warmth: 'hot', drought: 'hardy', method: 'seed', daysToHarvest: 105, aliases: ['simsim', 'ufuta'] },
]

export const crops: Crop[] = definitions.map(crop => ({
  ...crop,
  name: copy.cropNames[crop.id as keyof typeof copy.cropNames],
}))

const warmthValues: Record<Warmth, Pick<CropThresholds, 'minSoilTempC' | 'heatStressMaxC'>> = {
  cool: { minSoilTempC: 7, heatStressMaxC: 30 },
  mild: { minSoilTempC: 12, heatStressMaxC: 35 },
  warm: { minSoilTempC: 15, heatStressMaxC: 38 },
  hot: { minSoilTempC: 18, heatStressMaxC: 40 },
}
const droughtValues: Record<Drought, Pick<CropThresholds, 'maxDrySpellDays' | 'onsetRainMm'>> = {
  delicate: { maxDrySpellDays: 4, onsetRainMm: 25 },
  sensitive: { maxDrySpellDays: 7, onsetRainMm: 25 },
  moderate: { maxDrySpellDays: 10, onsetRainMm: 20 },
  hardy: { maxDrySpellDays: 12, onsetRainMm: 20 },
}

export function thresholds(crop: Crop): CropThresholds {
  return { ...warmthValues[crop.warmth], ...droughtValues[crop.drought] }
}

export const defaultCropIds = ['maize', 'sorghum', 'common-beans', 'groundnuts', 'cowpeas']

export function visibleCrops(recentIds: string[], selectedId: string): Crop[] {
  const byId = new Map(crops.map(crop => [crop.id, crop]))
  const ids = [selectedId, ...recentIds, ...defaultCropIds]
  const unique = [...new Set(ids)].filter(id => byId.has(id)).slice(0, 5)
  return unique.map(id => byId.get(id)!)
}

export function normalizeCropSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function searchCrops(query: string, category?: CropCategory | 'all'): Crop[] {
  const normalized = normalizeCropSearch(query)
  return crops.filter(crop =>
    (!category || category === 'all' || crop.category === category) &&
    (!normalized || [crop.name, ...crop.aliases].some(value => normalizeCropSearch(value).includes(normalized))),
  )
}
