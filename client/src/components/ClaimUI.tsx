import { Alert, App, Button, Card, DatePicker, Descriptions, Drawer, Form, Input, Select, Skeleton, Table, Tag, Timeline, Typography, Upload } from 'antd';
import { FileTextOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { claimApi, errorMessage } from '../api';
import type { AIStatus, Analysis, Claim, Priority, Role, Status } from '../types';
import { ReimbursementPanel } from './ReimbursementPanel';

export const statusLabels: Record<Status, string> = { SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved' };
const statusColors: Record<Status, string> = { SUBMITTED: 'blue', UNDER_REVIEW: 'orange', IN_PROGRESS: 'purple', RESOLVED: 'green' };
const priorityColors: Record<Priority, string> = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red' };
export const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
const nextStatus: Record<Status, Status | undefined> = { SUBMITTED: 'UNDER_REVIEW', UNDER_REVIEW: 'IN_PROGRESS', IN_PROGRESS: 'RESOLVED', RESOLVED: undefined };
export function StatusTag({ status }: { status: Status }) { return <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>; }
export function PriorityTag({ priority }: { priority: Priority }) { return <Tag color={priorityColors[priority]}>{priority}</Tag>; }
export function AIAnalysisCard({ analysis, status, onRetry, retrying }: { analysis?: Analysis; status?: AIStatus; onRetry?: () => void; retrying?: boolean }) { return <Card className="analysis-card" title="AI-generated assessment" size="small">{analysis ? <><div className="analysis-meta"><Tag>{analysis.category}</Tag><PriorityTag priority={analysis.priority} /></div><p>{analysis.summary}</p><Typography.Text type="secondary"><strong>Suggested action: </strong>{analysis.suggestedAction}</Typography.Text><p className="ai-disclaimer">Advisory only. The admin makes all claim decisions.</p></> : <Typography.Text type="secondary">{status === 'PENDING' ? 'Assessment in progress. Your claim has been submitted.' : status === 'FAILED' ? 'Assessment could not be completed. The claim remains available for human review.' : 'Assessment unavailable. The claim remains available for human review.'}</Typography.Text>}{onRetry ? <div className="analysis-retry"><Button onClick={onRetry} loading={retrying}>Retry AI assessment</Button></div> : null}</Card>; }
export function ClaimList({ claims, role, mobile, onOpen }: { claims: Claim[]; role: Role; mobile: boolean; onOpen: (claim: Claim) => void }) {
  if (mobile) return <div className="claim-cards">{claims.map(claim => <Card key={claim._id} className="claim-card" onClick={() => onOpen(claim)}><div className="card-top"><strong>{claim.claimNumber}</strong><StatusTag status={claim.status} /></div><h3>{claim.productName}</h3>{claim.reimbursement?.status === 'READY_FOR_COLLECTION' ? <Tag color="cyan">Voucher ready</Tag> : null}{role === 'ADMIN' ? <p>{typeof claim.customerId === 'object' ? claim.customerId.fullName : 'Customer'}</p> : null}<div className="card-bottom"><span>{dayjs(claim.createdAt).format('D MMM YYYY')}</span>{claim.aiAnalysis ? <PriorityTag priority={claim.aiAnalysis.priority} /> : null}<Button type="link" onClick={event => { event.stopPropagation(); onOpen(claim); }}>View</Button></div></Card>)}</div>;
  return <Table rowKey="_id" dataSource={claims} pagination={false} size="middle" onRow={claim => ({ onClick: () => onOpen(claim), className: 'clickable-row' })} columns={[
    { title: 'Claim number', dataIndex: 'claimNumber', key: 'number' },
    { title: 'Product', dataIndex: 'productName', key: 'product' },
    ...(role === 'ADMIN' ? [{ title: 'Customer', key: 'customer', render: (_: unknown, claim: Claim) => typeof claim.customerId === 'object' ? claim.customerId.fullName : '—' }] : []),
    { title: 'Status', key: 'status', render: (_: unknown, claim: Claim) => <><StatusTag status={claim.status} />{claim.reimbursement?.status === 'READY_FOR_COLLECTION' ? <Tag color="cyan">Voucher ready</Tag> : null}</> },
    ...(role === 'ADMIN' ? [{ title: 'AI priority', key: 'priority', render: (_: unknown, claim: Claim) => claim.aiAnalysis ? <PriorityTag priority={claim.aiAnalysis.priority} /> : '—' }] : []),
    { title: 'Submitted', key: 'date', render: (_: unknown, claim: Claim) => dayjs(claim.createdAt).format('D MMM YYYY') },
    { title: 'Action', key: 'action', render: (_: unknown, claim: Claim) => <Button type="link" onClick={event => { event.stopPropagation(); onOpen(claim); }}>View</Button> },
  ]} />;
}

export function ClaimDetailsDrawer({ id, role, open, onClose, mobile }: { id: string | null; role: Role; open: boolean; onClose: () => void; mobile: boolean }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ status: Status; adminNote: string }>();
  const { data: claim, isLoading, isError, refetch } = useQuery({ queryKey: ['claim', role, id], queryFn: () => claimApi.detail(role, id!), enabled: !!id && open, refetchInterval: query => query.state.data?.aiStatus === 'PENDING' ? 3000 : false });
  const mutation = useMutation({ mutationFn: (values: { status?: string; adminNote?: string }) => claimApi.update(id!, values), onSuccess: () => { message.success('Claim updated'); queryClient.invalidateQueries({ queryKey: ['claims'] }); queryClient.invalidateQueries({ queryKey: ['claim', role, id] }); onClose(); }, onError: error => { message.error({ content: errorMessage(error), duration: 6 }); } });
  const retryMutation = useMutation({ mutationFn: () => claimApi.retryAnalysis(id!), onSuccess: () => { message.success('AI assessment started'); queryClient.invalidateQueries({ queryKey: ['claims'] }); queryClient.invalidateQueries({ queryKey: ['claim', role, id] }); }, onError: error => message.error({ content: errorMessage(error), duration: 6 }) });
  const canRetry = role === 'ADMIN' && claim && !claim.aiAnalysis && (
    !claim.aiStatus || claim.aiStatus === 'FAILED' || claim.aiStatus === 'UNAVAILABLE' ||
    (claim.aiStatus === 'PENDING' && dayjs().diff(dayjs(claim.updatedAt), 'minute') >= 2)
  );
  async function viewReceipt() {
    if (!id) return;
    const tab = window.open('', '_blank');
    try { const blob = await claimApi.receipt(role, id); const url = URL.createObjectURL(blob); if (tab) tab.location.href = url; else { const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'receipt'; anchor.click(); } setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (error) { tab?.close(); message.error({ content: errorMessage(error), duration: 6 }); }
  }
  return <Drawer title={claim?.claimNumber || 'Claim details'} open={open} onClose={onClose} width={mobile ? '100%' : 560} destroyOnClose className="detail-drawer">
    {isLoading ? <Skeleton active paragraph={{ rows: 10 }} /> : isError ? <Alert type="error" message="Could not load claim details" action={<Button onClick={() => refetch()}>Retry</Button>} /> : claim ? <div className="detail-content">
      <div className="detail-heading"><StatusTag status={claim.status} /><span>Submitted {dayjs(claim.createdAt).format('D MMM YYYY')}</span></div>
      {role === 'ADMIN' && typeof claim.customerId === 'object' ? <Card size="small" title="Customer"><strong>{claim.customerId.fullName}</strong><p className="muted">{claim.customerId.email}</p></Card> : null}
      <Card size="small" title="Product & issue"><Descriptions column={1} size="small" items={[{ key: 'name', label: 'Product', children: claim.productName }, { key: 'category', label: 'Category', children: claim.productCategory }, ...(claim.modelNumber ? [{ key: 'model', label: 'Model', children: claim.modelNumber }] : []), { key: 'purchase', label: 'Purchased', children: dayjs(claim.purchaseDate).format('D MMM YYYY') }]} /><h4>Issue description</h4><p className="preserve-lines">{claim.issueDescription}</p><Button icon={<FileTextOutlined />} onClick={viewReceipt}>View receipt</Button></Card>
      <AIAnalysisCard analysis={claim.aiAnalysis} status={claim.aiStatus} onRetry={canRetry ? () => retryMutation.mutate() : undefined} retrying={retryMutation.isPending} />
      <ReimbursementPanel key={`${claim._id}-${claim.reimbursement?.status ?? 'none'}`} claim={claim} role={role} />
      {role === 'CUSTOMER' && claim.adminNote ? <Card size="small" title="Admin note"><p className="preserve-lines">{claim.adminNote}</p></Card> : null}
      <Card size="small" title="Status history"><Timeline items={claim.statusHistory.map(item => ({ color: statusColors[item.status], children: <><strong>{statusLabels[item.status]}</strong><div className="muted">{dayjs(item.changedAt).format('D MMM YYYY, h:mm A')}</div></> }))} /></Card>
      {role === 'ADMIN' ? <Card size="small" title="Review claim"><Form form={form} layout="vertical" key={`${claim._id}-${claim.updatedAt}`} initialValues={{ status: claim.status, adminNote: claim.adminNote || '' }} onFinish={values => mutation.mutate(values)}><Form.Item name="status" label="Status"><Select options={statusOptions.filter(option => option.value === claim.status || (option.value === nextStatus[claim.status] && !(option.value === 'RESOLVED' && claim.reimbursement?.status === 'READY_FOR_COLLECTION')))} /></Form.Item><Form.Item name="adminNote" label="Admin note"><Input.TextArea rows={4} maxLength={2000} showCount placeholder="Add a note for the customer" /></Form.Item><Button type="primary" htmlType="submit" loading={mutation.isPending}>Save changes</Button></Form></Card> : null}
    </div> : null}
  </Drawer>;
}

type ClaimFormValues = { productName: string; productCategory: string; modelNumber?: string; purchaseDate: Dayjs; issueDescription: string };
export function NewClaimDrawer({ open, onClose, mobile }: { open: boolean; onClose: () => void; mobile: boolean }) {
  const [form] = Form.useForm<ClaimFormValues>();
  const [file, setFile] = useState<File | null>(null);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: claimApi.create, onSuccess: claim => { message.success(claim.aiStatus === 'PENDING' ? 'Claim submitted. AI assessment is in progress.' : 'Claim submitted'); form.resetFields(); setFile(null); queryClient.invalidateQueries({ queryKey: ['claims'] }); onClose(); }, onError: error => message.error({ content: errorMessage(error), duration: 6 }) });
  function submit(values: ClaimFormValues) {
    if (!file) { message.error('Attach a purchase receipt'); return; }
    const body = new FormData();
    body.append('productName', values.productName); body.append('productCategory', values.productCategory); body.append('modelNumber', values.modelNumber || ''); body.append('purchaseDate', values.purchaseDate.format('YYYY-MM-DD')); body.append('issueDescription', values.issueDescription); body.append('receipt', file);
    mutation.mutate(body);
  }
  return <Drawer title="New warranty claim" open={open} onClose={onClose} width={mobile ? '100%' : 540} destroyOnClose className="new-claim-drawer"><p className="muted">Tell us about your product and what happened. A receipt is required.</p><Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
    <Form.Item label="Product name" name="productName" rules={[{ required: true, message: 'Enter the product name' }, { min: 2 }]}><Input placeholder="e.g. Electric kettle" maxLength={120} /></Form.Item>
    <Form.Item label="Product category" name="productCategory" rules={[{ required: true, message: 'Choose a category' }]}><Select placeholder="Select category" options={['Fan', 'Kitchen Appliance', 'Home Appliance', 'Electrical Appliance', 'Other'].map(value => ({ value, label: value }))} /></Form.Item>
    <Form.Item label="Model number (optional)" name="modelNumber"><Input placeholder="e.g. EK-200" maxLength={100} /></Form.Item>
    <Form.Item label="Purchase date" name="purchaseDate" rules={[{ required: true, message: 'Select the purchase date' }]}><DateInput /></Form.Item>
    <Form.Item label="Issue description" name="issueDescription" rules={[{ required: true, message: 'Describe the issue' }, { min: 15, message: 'Please provide at least 15 characters' }]}><Input.TextArea rows={5} maxLength={3000} showCount placeholder="Describe what is wrong and when it started" /></Form.Item>
    <Form.Item label="Purchase receipt" required extra="JPG, PNG or PDF, up to 5 MB"><Upload beforeUpload={selected => { if (!['image/jpeg', 'image/png', 'application/pdf'].includes(selected.type) || selected.size > 5 * 1024 * 1024) { message.error('Choose a JPG, PNG or PDF file under 5 MB'); return Upload.LIST_IGNORE; } setFile(selected); return false; }} onRemove={() => setFile(null)} maxCount={1} accept="image/jpeg,image/png,application/pdf" fileList={file ? [{ uid: '-1', name: file.name, status: 'done' }] : []}><Button icon={<PlusOutlined />}>Choose receipt</Button></Upload></Form.Item>
    <div className="drawer-actions"><Button onClick={onClose}>Cancel</Button><Button type="primary" htmlType="submit" loading={mutation.isPending}>Submit claim</Button></div>
  </Form></Drawer>;
}
function DateInput({ value, onChange }: { value?: Dayjs; onChange?: (date: Dayjs | null) => void }) { return <DatePicker value={value} onChange={onChange} disabledDate={date => date.isAfter(dayjs(), 'day')} style={{ width: '100%' }} />; }
