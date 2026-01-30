import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchableBranchSelect } from '../../src/renderer/components/SearchableBranchSelect'

// Mock the useClickOutside hook
vi.mock('../../src/renderer/hooks/useClickOutside', () => ({
  useClickOutside: vi.fn()
}))

describe('SearchableBranchSelect Component', () => {
  const mockBranches = ['main', 'master', 'develop', 'feature/test', 'release/1.0']
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders with placeholder when no value selected', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
        />
      )
      
      expect(screen.getByText('Select target branch...')).toBeInTheDocument()
    })

    it('renders with selected value', () => {
      render(
        <SearchableBranchSelect
          value="develop"
          branches={mockBranches}
          onSelect={mockOnSelect}
        />
      )
      
      expect(screen.getByText('develop')).toBeInTheDocument()
    })

    it('renders label when provided', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
          label="Target branch:"
        />
      )
      
      expect(screen.getByText('Target branch:')).toBeInTheDocument()
    })

    it('shows loading state', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={[]}
          onSelect={mockOnSelect}
          isLoading={true}
        />
      )
      
      expect(screen.getByText('Loading branches...')).toBeInTheDocument()
    })
  })

  describe('Dropdown Interaction', () => {
    it('opens dropdown when button clicked', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
        />
      )
      
      const button = screen.getByRole('button')
      fireEvent.click(button)
      
      // Search input should appear
      expect(screen.getByPlaceholderText('Search branches...')).toBeInTheDocument()
    })

    it('shows all branches in dropdown', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
        />
      )
      
      fireEvent.click(screen.getByRole('button'))
      
      mockBranches.forEach(branch => {
        expect(screen.getByText(new RegExp(branch))).toBeInTheDocument()
      })
    })

    it('filters branches when searching', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
        />
      )
      
      fireEvent.click(screen.getByRole('button'))
      
      const searchInput = screen.getByPlaceholderText('Search branches...')
      fireEvent.change(searchInput, { target: { value: 'feature' } })
      
      // Should show feature/test but not others
      expect(screen.getByText(/feature\/test/)).toBeInTheDocument()
      expect(screen.queryByText(/^develop$/)).not.toBeInTheDocument()
    })

    it('calls onSelect when branch clicked', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
        />
      )
      
      fireEvent.click(screen.getByRole('button'))
      
      // Find and click on 'develop' option
      const developOption = screen.getAllByRole('button').find(
        btn => btn.textContent?.includes('develop')
      )
      if (developOption) {
        fireEvent.click(developOption)
      }
      
      expect(mockOnSelect).toHaveBeenCalledWith('develop')
    })
  })

  describe('Empty State', () => {
    it('shows empty message when no branches', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={[]}
          onSelect={mockOnSelect}
        />
      )
      
      fireEvent.click(screen.getByRole('button'))
      
      expect(screen.getByText('No branches available')).toBeInTheDocument()
    })

    it('shows no match message when search has no results', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
        />
      )
      
      fireEvent.click(screen.getByRole('button'))
      
      const searchInput = screen.getByPlaceholderText('Search branches...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })
      
      expect(screen.getByText('No branches match your search')).toBeInTheDocument()
    })
  })

  describe('Disabled State', () => {
    it('does not open dropdown when disabled', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
          disabled={true}
        />
      )
      
      const button = screen.getByRole('button')
      fireEvent.click(button)
      
      expect(screen.queryByPlaceholderText('Search branches...')).not.toBeInTheDocument()
    })
  })

  describe('Default Badge', () => {
    it('shows default badge for main branch', () => {
      render(
        <SearchableBranchSelect
          value={null}
          branches={mockBranches}
          onSelect={mockOnSelect}
        />
      )
      
      fireEvent.click(screen.getByRole('button'))
      
      // Should have "default" badge
      expect(screen.getAllByText('default').length).toBeGreaterThanOrEqual(1)
    })
  })
})
