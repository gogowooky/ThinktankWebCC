import { forwardRef } from 'react';
import { SearchBar, type SearchBarProps, type SearchBarRef } from '../Filters/SearchBar';
import './ThinktankFilterPanel.css';
import './ThinktankSearchBar.css';

export type ThinktankSearchBarRef = SearchBarRef;

export const ThinktankSearchBar = forwardRef<ThinktankSearchBarRef, SearchBarProps>(function ThinktankSearchBar(props, ref) {
  return <SearchBar {...props} ref={ref} classPrefix="tt-search-bar" />;
});
