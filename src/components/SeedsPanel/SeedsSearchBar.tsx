import { forwardRef } from 'react';
import { SearchBar, type SearchBarProps, type SearchBarRef } from '../Filters/SearchBar';
import './SeedsFilterPanel.css';
import './SeedsSearchBar.css';

export type SeedsSearchBarRef = SearchBarRef;

export const SeedsSearchBar = forwardRef<SeedsSearchBarRef, SearchBarProps>(function SeedsSearchBar(props, ref) {
  return <SearchBar {...props} ref={ref} classPrefix="seeds-search-bar" />;
});
