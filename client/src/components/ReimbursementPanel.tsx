import { Alert, App, Button, Card, Checkbox, Descriptions, Form, Input, InputNumber, Select, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { claimApi, errorMessage } from '../api';
import type { Claim, Role } from '../types';

const money = (amountMinor: number, currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency }).format(amountMinor / 100);

export function ReimbursementPanel({ claim, role }: { claim: Claim; role: Role }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [voucherCode, setVoucherCode] = useState('');
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const [receiptChecked, setReceiptChecked] = useState(false);
  const reimbursement = claim.reimbursement;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['claims'] });
    queryClient.invalidateQueries({ queryKey: ['claim'] });
  };
  const issue = useMutation({
    mutationFn: (values: { amount: number; currency: string }) => claimApi.issueReimbursement(claim._id, values),
    onSuccess: () => { message.success('Pickup voucher issued to the customer account'); refresh(); },
    onError: error => message.error({ content: errorMessage(error), duration: 6 }),
  });
  const verify = useMutation({
    mutationFn: (code: string) => claimApi.verifyVoucher(claim._id, code),
    onSuccess: () => { setVerifiedCode(voucherCode.trim().toUpperCase()); message.success('Voucher code verified'); },
    onError: error => { setVerifiedCode(null); message.error({ content: errorMessage(error), duration: 6 }); },
  });
  const collect = useMutation({
    mutationFn: (code: string) => claimApi.collectReimbursement(claim._id, code),
    onSuccess: () => { message.success('Collection recorded and claim resolved'); refresh(); },
    onError: error => message.error({ content: errorMessage(error), duration: 6 }),
  });
  async function downloadVoucher() {
    try {
      const blob = await claimApi.voucher(role, claim._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${claim.claimNumber}-pickup-voucher.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { message.error({ content: errorMessage(error), duration: 6 }); }
  }

  if (!reimbursement) {
    if (role !== 'ADMIN' || !['UNDER_REVIEW', 'IN_PROGRESS'].includes(claim.status)) return null;
    return <Card size="small" title="Issue reimbursement pickup voucher">
      <p className="muted">Enter the approved amount. Issuing the voucher moves the claim to In progress and gives the customer collection instructions.</p>
      <Form layout="vertical" initialValues={{ currency: 'PKR' }} onFinish={values => issue.mutate(values)}>
        <Form.Item name="amount" label="Approved amount" rules={[{ required: true, message: 'Enter the approved amount' }]}><InputNumber min={0.01} max={1000000} precision={2} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="currency" label="Currency" rules={[{ required: true }]}><Select options={['PKR', 'USD', 'EUR', 'GBP'].map(value => ({ value, label: value }))} /></Form.Item>
        <Button type="primary" htmlType="submit" loading={issue.isPending}>Issue pickup voucher</Button>
      </Form>
    </Card>;
  }

  const ready = reimbursement.status === 'READY_FOR_COLLECTION';
  return <Card size="small" title={ready ? 'Reimbursement ready for collection' : 'Reimbursement collected'}>
    <Alert type={ready ? 'info' : 'success'} showIcon message={ready ? 'Your pickup voucher is ready' : 'Collection recorded'} description={ready
      ? 'This is a demonstration collection address. Bring your pickup voucher and the original purchase receipt. Staff will verify both before recording the handover.'
      : `Collection was recorded on ${dayjs(reimbursement.collectedAt).format('D MMM YYYY, h:mm A')}.`} />
    <Descriptions column={1} size="small" className="reimbursement-details" items={[
      { key: 'amount', label: 'Approved amount', children: money(reimbursement.amountMinor, reimbursement.currency) },
      { key: 'address', label: 'Mock pickup address', children: reimbursement.pickupAddress },
      ...(role === 'CUSTOMER' || !ready ? [{ key: 'code', label: 'Verification code', children: <Typography.Text copyable code>{reimbursement.voucherCode}</Typography.Text> }] : []),
      { key: 'issued', label: 'Voucher issued', children: dayjs(reimbursement.issuedAt).format('D MMM YYYY, h:mm A') },
    ]} />
    <Button icon={<DownloadOutlined />} onClick={downloadVoucher}>Download pickup voucher (PDF)</Button>
    <p className="muted reimbursement-disclaimer">Demo only: the address is fictional and CareTrack does not transfer funds. The voucher is not proof of payment.</p>
    {role === 'ADMIN' && ready ? <div className="collection-form">
      <h4>Record collection</h4>
      <p className="muted">Ask the customer for the voucher and original purchase receipt. Enter the code shown on the voucher to verify it against this claim.</p>
      <Input aria-label="Voucher verification code" placeholder="CTP-XXXX-XXXX-XXXX-XXXX" value={voucherCode} onChange={event => { setVoucherCode(event.target.value.toUpperCase()); setVerifiedCode(null); setReceiptChecked(false); }} maxLength={23} />
      <Button onClick={() => verify.mutate(voucherCode.trim())} loading={verify.isPending} disabled={!/^CTP-[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/.test(voucherCode.trim())}>Verify voucher</Button>
      {verifiedCode ? <Alert type="success" showIcon message="Voucher verified for this claim" description={`Approved amount: ${money(reimbursement.amountMinor, reimbursement.currency)}`} /> : null}
      <Checkbox checked={receiptChecked} onChange={event => setReceiptChecked(event.target.checked)} disabled={!verifiedCode}>I checked the customer's original purchase receipt and handed over the approved amount.</Checkbox>
      <Button type="primary" danger onClick={() => collect.mutate(verifiedCode!)} loading={collect.isPending} disabled={!verifiedCode || !receiptChecked}>Confirm payment collected and resolve claim</Button>
    </div> : null}
  </Card>;
}
