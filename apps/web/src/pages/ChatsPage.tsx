import { Check, Edit3, Search, Sparkles, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { ChatPanel } from '../features/chat/ChatPanel';
import { GroupChatPanel } from '../features/chat/GroupChatPanel';
import { useNovaStore } from '../stores/nova.store';

export function ChatsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId, groupId } = useParams();
  const { friends, groups, createGroup } = useNovaStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const active = friends.find((friend) => friend.id === userId);
  const activeGroup = groups.find((group) => group.id === groupId);
  const hasActive = Boolean(active || activeGroup);
  const filtered = friends.filter((friend) => friend.username.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || Boolean(friend.unread)));
  const filteredGroups = groups.filter((group) => group.name.toLowerCase().includes(query.toLowerCase()));

  const saveGroup = async () => {
    if (!groupName.trim() || !selected.length || saving) return;
    setSaving(true);
    setError('');
    try {
      const group = await createGroup(groupName.trim(), selected);
      setCreatingGroup(false);
      setGroupName('');
      setSelected([]);
      navigate(`/app/groups/${group.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إنشاء المجموعة.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="chats-layout">
      <aside className={`conversation-pane ${hasActive ? 'mobile-hidden' : ''}`}>
        <div className="pane-title"><div><span>NOVA / INBOX</span><h1>{t('chats.title')}</h1><p>{t('chats.subtitle')}</p></div><button aria-label="إنشاء مجموعة" title="إنشاء مجموعة" onClick={() => setCreatingGroup(true)}><UsersRound /></button></div>
        <label className="search-box"><Search /><input id="conversation-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chats.search')} /></label>
        <div className="conversation-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{friends.length + groups.length}</span></button><button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Unread <span>{friends.reduce((count, friend) => count + (friend.unread ? 1 : 0), 0)}</span></button></div>
        <div className="conversation-scroll">
          {filter === 'all' && filteredGroups.map((group) => <Link className={group.id === groupId ? 'active' : ''} to={`/app/groups/${group.id}`} key={group.id}><span className="group-call-avatar"><UsersRound /></span><span className="conversation-copy"><strong>{group.name}</strong><small>{group.members.length} أعضاء</small></span></Link>)}
          {filtered.map((friend) => <Link className={friend.id === userId ? 'active' : ''} to={`/app/chats/${friend.id}`} key={friend.id}><Avatar user={friend} size="md" showStatus /><span className="conversation-copy"><strong>{friend.username}</strong><small>{friend.lastMessage ?? 'Start a conversation'}</small></span><time>{friend.lastMessageAt ? new Date(friend.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}{friend.unread ? <b>{friend.unread}</b> : null}</time></Link>)}
        </div>
        <div className="inbox-note"><Sparkles /><span><strong>Your quiet inbox</strong><small>No ads, suggested posts, or public noise.</small></span></div>
      </aside>
      <div className={`chat-stage ${hasActive ? 'mobile-active' : ''}`}>{active ? <ChatPanel friend={active} /> : activeGroup ? <GroupChatPanel group={activeGroup} /> : <div className="empty-chat"><div className="empty-orbit"><span><Sparkles /></span><i /><i /></div><h2>{t('chats.empty')}</h2><p>{t('chats.emptyBody')}</p><span className="secure-note">◈ Private by design</span></div>}</div>

      {creatingGroup && <div className="group-picker-backdrop"><section className="group-picker glass-panel"><header><div><span>NOVA GROUP</span><h2>إنشاء مجموعة جديدة</h2><p>اختر اسمًا وأعضاء من أصدقائك.</p></div><button onClick={() => setCreatingGroup(false)}><X /></button></header><div className="group-creator-body"><input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="اسم المجموعة" maxLength={80} />{error && <div className="message-send-error">{error}</div>}<div className="group-friend-list">{friends.map((friend) => { const checked = selected.includes(friend.id); return <button className={checked ? 'selected' : ''} key={friend.id} onClick={() => setSelected((items) => checked ? items.filter((id) => id !== friend.id) : [...items, friend.id])}><Avatar user={friend} size="md" /><span className="group-friend-copy"><strong>{friend.username}</strong><small>{friend.status}</small></span><i>{checked && <Check />}</i></button>; })}</div></div><footer><button className="button button-ghost" onClick={() => setCreatingGroup(false)}>إلغاء</button><button className="button button-primary" disabled={saving || !groupName.trim() || !selected.length} onClick={() => void saveGroup()}><Edit3 />{saving ? 'جارٍ الإنشاء…' : 'إنشاء المجموعة'}</button></footer></section></div>}
    </div>
  );
}
