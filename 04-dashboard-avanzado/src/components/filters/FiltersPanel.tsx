import type { FilterOption } from '../../types/dashboard.types';

interface FilterGroup {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

interface FiltersPanelProps {
  filters: FilterGroup[];
}

export default function FiltersPanel({ filters }: FiltersPanelProps) {
  return (
    <section className="filters-panel">
      {filters.map((filter) => (
        <label key={filter.id} className="filter-field">
          <span>{filter.label}</span>
          <select
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </section>
  );
}