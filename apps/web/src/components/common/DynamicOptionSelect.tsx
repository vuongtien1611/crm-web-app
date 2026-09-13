import React, { useState, useMemo } from 'react';
import { AutoComplete, Spin } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDynamicOptions, recordOptionUse, DynamicOptionItem } from '../../api/dynamicOptions';

export interface DynamicOptionSelectProps {
  fieldKey: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  defaultOptions?: string[];
  autoRecordOnBlur?: boolean;
  style?: React.CSSProperties;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
}

export const DynamicOptionSelect: React.FC<DynamicOptionSelectProps> = ({
  fieldKey,
  value,
  onChange,
  placeholder = 'Nhập hoặc chọn...',
  defaultOptions = [],
  autoRecordOnBlur = true,
  style,
  disabled = false,
  allowClear = true,
  className,
}) => {
  const queryClient = useQueryClient();
  const [searchValue, setSearchValue] = useState('');

  const { data: dbOptions = [], isLoading } = useQuery({
    queryKey: ['dynamic-options', fieldKey],
    queryFn: () => fetchDynamicOptions(fieldKey),
    staleTime: 30000,
  });

  const recordMutation = useMutation({
    mutationFn: (val: string) => recordOptionUse(fieldKey, val),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dynamic-options', fieldKey] });
    },
  });

  const handleRecord = (val?: string) => {
    const text = (val ?? value ?? '').trim();
    if (!text) return;
    recordMutation.mutate(text);
  };

  // Combine fetched DB options with default suggestions
  const mergedOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { value: string; label: React.ReactNode; usageCount?: number }[] = [];

    // 1. DB options (already ordered by last_used_at DESC, usage_count DESC)
    dbOptions.forEach((opt: DynamicOptionItem) => {
      const norm = opt.normalized_value;
      if (!seen.has(norm)) {
        seen.add(norm);
        list.push({
          value: opt.value,
          usageCount: opt.usage_count,
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{opt.value}</span>
              {opt.usage_count > 1 && (
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                  {opt.usage_count} lần
                </span>
              )}
            </div>
          ),
        });
      }
    });

    // 2. Default options fallback if DB is empty or lacks them
    defaultOptions.forEach((def) => {
      const norm = def.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!seen.has(norm)) {
        seen.add(norm);
        list.push({
          value: def,
          label: <span>{def}</span>,
        });
      }
    });

    // 3. If searching and search term not in list, provide quick "Add new" hint
    const currentSearch = (searchValue || '').trim();
    if (currentSearch) {
      const searchNorm = currentSearch.toLowerCase().replace(/\s+/g, ' ');
      const matchExists = list.some(
        (o) => o.value.toLowerCase().replace(/\s+/g, ' ') === searchNorm,
      );

      if (!matchExists) {
        return [
          {
            value: currentSearch,
            label: (
              <div style={{ color: 'var(--vmax-green, #0C6B37)', fontWeight: 600 }}>
                + Dùng mới: "{currentSearch}"
              </div>
            ),
          },
          ...list.filter((o) =>
            o.value.toLowerCase().includes(currentSearch.toLowerCase()),
          ),
        ];
      }
    }

    return list;
  }, [dbOptions, defaultOptions, searchValue]);

  return (
    <AutoComplete
      className={className}
      style={{ width: '100%', ...style }}
      value={value}
      options={mergedOptions}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear}
      onSearch={(txt) => setSearchValue(txt)}
      onChange={(val) => {
        onChange?.(val);
      }}
      onSelect={(val) => {
        onChange?.(val);
        handleRecord(val);
      }}
      onBlur={() => {
        if (autoRecordOnBlur && value) {
          handleRecord(value);
        }
      }}
      notFoundContent={isLoading ? <Spin size="small" style={{ padding: 8 }} /> : null}
      filterOption={(inputValue, option) =>
        String(option?.value || '').toLowerCase().includes(inputValue.toLowerCase())
      }
    />
  );
};
