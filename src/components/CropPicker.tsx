import { useEffect, useMemo, useRef, useState } from 'react'
import { crops, searchCrops, type Crop, type CropCategory } from '../lib/api'
import copy from '../i18n/en.json'

const categoryOrder: (CropCategory | 'all')[] = ['all', 'cereal', 'legume', 'root', 'vegetable', 'cash']
const categoryIcons: Record<CropCategory, string> = {
  cereal: '🌾',
  legume: '🫘',
  root: '🥔',
  vegetable: '🥬',
  cash: '◈',
}

function CropIcon({ crop }: { crop: Crop }) {
  return <span className={`crop-icon category-${crop.category}`} aria-hidden="true">{crop.emoji ?? categoryIcons[crop.category]}</span>
}

export default function CropPicker({
  visible,
  selectedId,
  remainingCount,
  onSelect,
}: {
  visible: Crop[]
  selectedId: string
  remainingCount: number
  onSelect: (crop: Crop) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CropCategory | 'all'>('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const moreTileRef = useRef<HTMLButtonElement>(null)
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([])
  const results = useMemo(() => searchCrops(query, category), [category, query])
  const emptyLabel = copy.cropEmptySearch.replace('{query}', query.trim())

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    if (open) requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

  useEffect(() => { setActiveIndex(0) }, [category, query])

  const chooseCrop = (crop: Crop) => {
    onSelect(crop)
    setOpen(false)
  }
  const moveFocus = (index: number) => {
    const next = (index + results.length) % results.length
    setActiveIndex(next)
    resultRefs.current[next]?.focus()
  }

  return <>
    <div className="crop-grid">
      {visible.map(crop => <button
        key={crop.id}
        type="button"
        className={`crop-chip ${crop.id === selectedId ? 'selected' : ''}`}
        aria-pressed={crop.id === selectedId}
        onClick={() => onSelect(crop)}
      >
        <CropIcon crop={crop} />{crop.name}
      </button>)}
      <button ref={moreTileRef} type="button" className="crop-chip more-crops" onClick={() => {
        setQuery('')
        setCategory('all')
        setOpen(true)
      }}>
        <span className="more-icon" aria-hidden="true">＋</span>
        <span>{copy.moreCrops}<small>{copy.moreCropCount.replace('{count}', String(remainingCount))}</small></span>
      </button>
    </div>
    <dialog
      ref={dialogRef}
      className="crop-dialog"
      aria-labelledby="crop-dialog-title"
      onCancel={event => { event.preventDefault(); setOpen(false) }}
      onClose={() => {
        if (open) setOpen(false)
        requestAnimationFrame(() => moreTileRef.current?.focus())
      }}
      onClick={event => { if (event.target === dialogRef.current) setOpen(false) }}
    >
      <div className="crop-dialog-inner">
        <div className="crop-dialog-header">
          <div><span className="section-kicker">{copy.cropDialogKicker}</span><h2 id="crop-dialog-title">{copy.cropDialogTitle}</h2></div>
          <button type="button" className="dialog-close" aria-label={copy.closeDialog} onClick={() => setOpen(false)}>×</button>
        </div>
        <label className="crop-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            autoFocus
            type="search"
            aria-label={copy.cropSearchLabel}
            placeholder={copy.cropSearchPlaceholder}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (!results.length) return
              if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(0) }
              if (event.key === 'Enter') { event.preventDefault(); chooseCrop(results[activeIndex] ?? results[0]!) }
            }}
          />
        </label>
        <div className="crop-categories" aria-label={copy.cropCategoryLabel}>
          {categoryOrder.map(value => <button
            type="button"
            key={value}
            aria-pressed={category === value}
            className={category === value ? 'active' : ''}
            onClick={() => setCategory(value)}
          >{copy.cropCategories[value]}</button>)}
        </div>
        {results.length ? <div className="crop-results" role="listbox" aria-label={copy.cropResultsLabel}>
          {results.map((crop, index) => <button
            ref={element => { resultRefs.current[index] = element }}
            id={`crop-result-${crop.id}`}
            type="button"
            role="option"
            aria-selected={crop.id === selectedId}
            className={`crop-result ${activeIndex === index ? 'active' : ''}`}
            key={crop.id}
            onClick={() => chooseCrop(crop)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(index + 1) }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                if (index === 0) searchRef.current?.focus()
                else moveFocus(index - 1)
              }
            }}
          >
            <CropIcon crop={crop} />
            <span className="crop-result-name">{crop.name}</span>
            <span className="crop-result-tag">{copy.cropDays
              .replace('{label}', copy.droughtLabels[crop.drought])
              .replace('{days}', String(crop.daysToHarvest))}</span>
          </button>)}
        </div> : <p className="crop-empty">{emptyLabel}</p>}
      </div>
    </dialog>
  </>
}
