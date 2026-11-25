import { Grid2X2, Heart, House, ShoppingBag, UserRound } from 'lucide-react';

const destinations = [
  { label: 'Home', icon: House },
  { label: 'Shop', icon: Grid2X2 },
  { label: 'Saved', icon: Heart },
  { label: 'Bag', icon: ShoppingBag },
  { label: 'Account', icon: UserRound }
];

export default function BottomNavigation({ activeTab, cartCount, savedCount, onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {destinations.map(({ label, icon: Icon }) => {
        const selected = label === 'Saved'
          ? activeTab === 'Saved'
          : label === 'Account'
            ? ['Account', 'Orders', 'Admin', 'Payment'].includes(activeTab)
            : label === 'Bag'
              ? ['Bag', 'Checkout'].includes(activeTab)
              : activeTab === label;
        const badge = label === 'Bag' ? cartCount : label === 'Saved' ? savedCount : 0;
        return (
          <button
            key={label}
            className={selected ? 'nav-item active' : 'nav-item'}
            type="button"
            aria-current={selected ? 'page' : undefined}
            onClick={() => onNavigate(label)}
          >
            <span className="nav-icon">
              <Icon size={21} strokeWidth={selected ? 2.4 : 1.8} />
              {badge > 0 && <b>{badge}</b>}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
