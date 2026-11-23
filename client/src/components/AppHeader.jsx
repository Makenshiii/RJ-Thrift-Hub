import { ArrowLeft, UserRound } from 'lucide-react';

const titles = {
  Home: ['RJ Thrift Hub', 'One-of-a-kind finds'],
  Shop: ['Shop', 'Find your next favorite'],
  Bag: ['Your bag', 'Review your selected pieces'],
  Orders: ['Orders', 'Track your purchases'],
  Saved: ['Saved pieces', 'Your shortlist, saved on this device'],
  Account: ['Account', 'Your profile and preferences'],
  Admin: ['Store admin', 'Manage your shop']
};

export default function AppHeader({ activeTab, user, onHome, onBack, onAccount }) {
  const [title, subtitle] = titles[activeTab] || titles.Home;
  const canGoBack = ['Orders', 'Admin'].includes(activeTab);

  return (
    <header className="app-header">
      <button className="app-mark" type="button" aria-label={canGoBack ? 'Go back' : 'Go to home'} onClick={canGoBack ? onBack : onHome}>
        {canGoBack ? <ArrowLeft size={20} /> : 'RJ'}
      </button>
      <div className="app-header-copy">
        <strong>{title}</strong>
        <span>{user ? `Hi, ${user.name.split(' ')[0]}` : subtitle}</span>
      </div>
      <button className="header-account-button" type="button" aria-label="Open account" onClick={onAccount}>
        <UserRound size={20} />
      </button>
    </header>
  );
}
