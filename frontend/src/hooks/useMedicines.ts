import { useEffect, useState } from 'react';

import {
  createMedicine,
  deleteMedicine as deleteMedicineRequest,
  getMedicines,
  getStats,
  updateMedicine as updateMedicineRequest,
} from '../lib/api';
import { getMedicineStatus } from '../lib/utils';
import type { Medicine, MedicineFilterStatus, Stats } from '../types';

type FilterState = {
  category?: string;
  status?: MedicineFilterStatus;
};

type MedicinePayload = Omit<Medicine, 'id' | 'created_at' | 'updated_at'>;

const emptyStats: Stats = {
  total: 0,
  expired: 0,
  expiring: 0,
  ok: 0,
  categories: [],
};

export function useMedicines(expiringDays: number) {
  const [allMedicines, setAllMedicines] = useState<Medicine[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterState>({});

  const refresh = async () => {
    setLoading(true);
    setError('');

    try {
      const [list, nextStats] = await Promise.all([
        getMedicines({ expiringDays }),
        getStats(expiringDays),
      ]);
      setAllMedicines(list);
      setStats(nextStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载药品失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [expiringDays]);

  const medicines = allMedicines.filter((medicine) => {
    if (filter.category && medicine.category !== filter.category) {
      return false;
    }

    if (filter.status) {
      return getMedicineStatus(medicine.expires_at, expiringDays) === filter.status;
    }

    return true;
  });

  const addMedicine = async (data: MedicinePayload) => {
    await createMedicine(data);
    await refresh();
  };

  const updateMedicine = async (id: number, data: Partial<Medicine>) => {
    await updateMedicineRequest(id, data);
    await refresh();
  };

  const deleteMedicine = async (id: number) => {
    await deleteMedicineRequest(id);
    await refresh();
  };

  return {
    allMedicines,
    medicines,
    stats,
    loading,
    error,
    filter,
    setFilter,
    refresh,
    addMedicine,
    updateMedicine,
    deleteMedicine,
  };
}
