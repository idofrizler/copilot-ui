import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Spinner } from '../../src/renderer/components/Spinner'

describe('Spinner Component', () => {
  it('renders without crashing', () => {
    render(<Spinner />)
    const spinner = document.querySelector('svg')
    expect(spinner).toBeInTheDocument()
  })

  it('applies medium size by default', () => {
    render(<Spinner />)
    const spinner = document.querySelector('svg')
    expect(spinner).toHaveClass('w-4', 'h-4')
  })

  it('applies small size when specified', () => {
    render(<Spinner size="sm" />)
    const spinner = document.querySelector('svg')
    expect(spinner).toHaveClass('w-3', 'h-3')
  })

  it('applies large size when specified', () => {
    render(<Spinner size="lg" />)
    const spinner = document.querySelector('svg')
    expect(spinner).toHaveClass('w-6', 'h-6')
  })

  it('applies custom className', () => {
    render(<Spinner className="custom-class" />)
    const spinner = document.querySelector('svg')
    expect(spinner).toHaveClass('custom-class')
  })

  it('has animation class', () => {
    render(<Spinner />)
    const spinner = document.querySelector('svg')
    expect(spinner).toHaveClass('animate-spin')
  })
})
