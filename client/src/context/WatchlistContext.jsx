import { createContext, useContext, useState } from 'react';

const WatchlistContext = createContext();

export function WatchlistProvider({ children }) {
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vaultdeal_watchlist')) || []; }
    catch { return []; }
  });

  const save = (list) => {
    setWatchlist(list);
    localStorage.setItem('vaultdeal_watchlist', JSON.stringify(list));
  };

  const toggle = (deal) => {
    const isIn = watchlist.some((w) => w.game_id === deal.game_id);
    if (isIn) {
      save(watchlist.filter((w) => w.game_id !== deal.game_id));
    } else {
      save([...watchlist, {
        game_id: deal.game_id,
        title: deal.title,
        header_image: deal.header_image,
        price_current: deal.price_current,
        discount_pct: deal.discount_pct,
        store: deal.store,
      }]);
    }
    return !isIn; // returns true if now watched
  };

  const isWatched = (gameId) => watchlist.some((w) => w.game_id === gameId);

  return (
    <WatchlistContext.Provider value={{ watchlist, toggle, isWatched }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  return useContext(WatchlistContext);
}
