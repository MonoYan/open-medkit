import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../lib/api';
import type { Settings } from '../types';
import { AddModal } from './AddModal';

vi.mock('../lib/api', () => ({
  completeMedicineDraft: vi.fn(),
  getCategories: vi.fn(),
  parseMedicineBatchStream: vi.fn(),
  parseMedicineImageStream: vi.fn(),
  parseMedicineStream: vi.fn(),
}));

const settings: Settings = {
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  defaultHomeTab: 'ai',
  defaultListView: 'grid',
  expiringDays: 30,
  aiResponseStyle: 'concise',
  themePreference: 'system',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('AddModal', () => {
  it('enables manual submit once a medicine name is entered', async () => {
    vi.mocked(api.getCategories).mockResolvedValue(['感冒发烧']);

    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <AddModal
        open
        onClose={onClose}
        settings={settings}
        onCreate={onCreate}
        onUpdate={onUpdate}
      />,
    );

    await waitFor(() => expect(api.getCategories).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: '直接手动填写' }));

    const submitButton = screen.getByRole('button', { name: '确认添加' });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('药品名称'), {
      target: { value: '布洛芬缓释胶囊' },
    });

    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '布洛芬缓释胶囊',
        }),
      ),
    );
  });
});
