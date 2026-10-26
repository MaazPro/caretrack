import { useState } from 'react';
import { Alert, App, Button, Card, Empty, Grid, Input, Pagination, Select, Skeleton, Typography } from 'antd';
import { LogoutOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { claimApi } from '../api';
import { useAuth } from '../auth';
import { ClaimDetailsDrawer, ClaimList, NewClaimDrawer, statusOptions } from '../components/ClaimUI';
import type { Claim, Role } from '../types';

function StatCard({ label, value }: { label: string; value: number | undefined }) { return <Card className="stat-card"><div className="stat-label">{label}</div><strong>{value ?? '—'}</strong></Card>; }
export function DashboardPage({ role }: { role: Role }) {
  const { user, signOut } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.md;
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>();
  const [priority, setPriority] = useState<string>();
  const [page, setPage] = useState(1);
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Claim | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['claims', role, page, search, status, priority], queryFn: () => claimApi.list(role, { page, limit: 10, search: search || undefined, status, priority: role === 'ADMIN' ? priority : undefined }), refetchInterval: query => query.state.data?.data.some(claim => claim.aiStatus === 'PENDING') ? 4000 : false });
  const setFilter = (kind: 'status' | 'priority', value: string | undefined) => { setPage(1); kind === 'status' ? setStatus(value) : setPriority(value); };
  function logout() { signOut(); message.success('Signed out'); navigate('/login', { replace: true }); }
  return <div className="dashboard">
    <header className="app-header"><div className="header-inner"><div className="brand">Care<span>Track</span></div><div className="header-user"><span className="user-name">{user?.fullName}</span><Button icon={<LogoutOutlined />} onClick={logout}>{mobile ? '' : 'Log out'}</Button></div></div></header>
    <main className="dashboard-main"><div className="page-heading"><Typography.Title level={1}>{role === 'ADMIN' ? 'Claim management' : 'My warranty claims'}</Typography.Title><p>{role === 'ADMIN' ? 'Review and update warranty claims in one place.' : 'Track and manage all your warranty claims in one place.'}</p></div>
      <section className="stats-grid" aria-label="Claim statistics">{role === 'ADMIN' ? <><StatCard label="Total Claims" value={data?.stats.total} /><StatCard label="Submitted" value={data?.stats.submitted} /><StatCard label="In Progress" value={data?.stats.inProgress} /><StatCard label="Resolved" value={data?.stats.resolved} /></> : <><StatCard label="Total Claims" value={data?.stats.total} /><StatCard label="Active Claims" value={data?.stats.active} /><StatCard label="Resolved Claims" value={data?.stats.resolved} /></>}</section>
      <section className="claims-panel"><div className="claims-title-row"><Typography.Title level={3}>Claims</Typography.Title>{role === 'CUSTOMER' ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewOpen(true)} className="desktop-new">New claim</Button> : null}</div>
        <div className="filters"><Input.Search placeholder={role === 'ADMIN' ? 'Search claim, product or customer' : 'Search claim number or product'} value={searchInput} onChange={event => { setSearchInput(event.target.value); if (!event.target.value) { setSearch(''); setPage(1); } }} onSearch={value => { setSearch(value.trim()); setPage(1); }} allowClear className="search-control" /><Select allowClear placeholder="All statuses" value={status} onChange={value => setFilter('status', value)} options={statusOptions} className="filter-control" />{role === 'ADMIN' ? <Select allowClear placeholder="All priorities" value={priority} onChange={value => setFilter('priority', value)} options={['LOW', 'MEDIUM', 'HIGH'].map(value => ({ value, label: value }))} className="filter-control" /> : null}{role === 'CUSTOMER' ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewOpen(true)} className="mobile-new">New claim</Button> : null}</div>
        {isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : isError ? <Alert type="error" message="Something went wrong while loading your claims." action={<Button onClick={() => refetch()}>Retry</Button>} /> : data?.data.length ? <><ClaimList claims={data.data} role={role} mobile={mobile} onOpen={setSelected} /><div className="pagination-row"><span>Showing {((page - 1) * 10) + 1}–{Math.min(page * 10, data.pagination.total)} of {data.pagination.total} claims</span><Pagination current={page} pageSize={10} total={data.pagination.total} onChange={setPage} showSizeChanger={false} size={mobile ? 'small' : 'default'} /></div></> : <Empty description={search || status || priority ? 'No claims match your search.' : role === 'CUSTOMER' ? 'No warranty claims yet.' : 'No claims yet.'}>{role === 'CUSTOMER' && !search && !status ? <><p className="muted">Submit your first warranty claim to get started.</p><Button type="primary" onClick={() => setNewOpen(true)}>Submit a claim</Button></> : null}</Empty>}
      </section>
    </main>
    {role === 'CUSTOMER' ? <NewClaimDrawer open={newOpen} onClose={() => setNewOpen(false)} mobile={mobile} /> : null}
    <ClaimDetailsDrawer id={selected?._id || null} role={role} open={!!selected} onClose={() => setSelected(null)} mobile={mobile} />
  </div>;
}
