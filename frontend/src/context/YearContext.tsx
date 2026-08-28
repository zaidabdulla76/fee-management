import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { yearsApi } from '../api';

const YearContext = createContext(null);

export function YearProvider({ children }) {
  const { data: years = [], isLoading } = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => (await yearsApi.list()).data,
  });

  const [selectedYearId, setSelectedYearId] = useState(
    () => localStorage.getItem('fee_year_id') || ''
  );

  useEffect(() => {
    if (!years.length) return;
    const active = years.find((y) => y.status === 'Active');
    const exists = years.some((y) => y.id === selectedYearId);
    if (!exists) {
      const id = active?.id || years[0].id;
      setSelectedYearId(id);
      localStorage.setItem('fee_year_id', id);
    }
  }, [years, selectedYearId]);

  const selectedYear = years.find((y) => y.id === selectedYearId) || null;

  const value = useMemo(
    () => ({
      years,
      isLoading,
      selectedYearId,
      selectedYear,
      setSelectedYearId: (id) => {
        setSelectedYearId(id);
        localStorage.setItem('fee_year_id', id);
      },
    }),
    [years, isLoading, selectedYearId, selectedYear]
  );

  return <YearContext.Provider value={value}>{children}</YearContext.Provider>;
}

export function useYear() {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error('useYear must be used within YearProvider');
  return ctx;
}
