import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MedicineDetailModal } from './MedicineDetailModal';

vi.mock('../hooks/useTimezone', () => ({
  useTimezone: () => ({
    timezone: 'Asia/Shanghai',
  }),
}));

const medicine = {
  id: 1,
  name: '布洛芬缓释胶囊',
  name_en: 'Ibuprofen SR Capsules',
  spec: '300mg/粒',
  quantity: '20粒',
  expires_at: '2026-07-01',
  category: '感冒发烧',
  usage_desc: '退烧止痛',
  location: '药箱 A 层',
  notes: '',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('MedicineDetailModal', () => {
  it('uses the themed confirm dialog before deleting', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <MedicineDetailModal
        medicine={medicine}
        expiringDays={30}
        onClose={onClose}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除药品' }));

    expect(
      screen.getByRole('alertdialog', { name: '确认删除「布洛芬缓释胶囊」吗？' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '先保留' }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除药品' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(medicine));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows an inline error when deletion fails', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('删除失败，请重试'));

    render(
      <MedicineDetailModal
        medicine={medicine}
        expiringDays={30}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除药品' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(medicine));
    expect(await screen.findByText('删除失败，请重试')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
