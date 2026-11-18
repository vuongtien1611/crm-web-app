import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DailyReportFilterOptions,
  getDailyReportFilterOptionsApi,
} from '../../api/dailyReports';

export const useDailyReportFilters = () => {
  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState<string | undefined>(undefined);
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>(undefined);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchKeyword.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 1. Fetch Filter Options
  const { data: filterOptions } = useQuery<DailyReportFilterOptions>({
    queryKey: ['dailyReportFilterOptions'],
    queryFn: getDailyReportFilterOptionsApi,
    staleTime: 5 * 60 * 1000,
  });

  // Dependent Filter Options:
  // Department -> Teams -> Employees
  const departmentOptions = useMemo(() => {
    return (filterOptions?.departments || []).map((d) => ({
      label: d === 'DEV' ? 'Phòng DEV' : d === 'SALES' ? 'Phòng Sales' : d === 'SEO' ? 'Phòng SEO' : `Phòng ${d}`,
      value: d,
    }));
  }, [filterOptions]);

  const teamOptions = useMemo(() => {
    let teamsList = filterOptions?.teams || [];
    if (selectedDepartment) {
      teamsList = teamsList.filter((t) => t.department === selectedDepartment);
    }
    return teamsList.map((t) => ({ label: t.name, value: t.id }));
  }, [filterOptions, selectedDepartment]);

  const employeeOptions = useMemo(() => {
    let empList = filterOptions?.employees || [];
    if (selectedTeamId) {
      empList = empList.filter((e) => e.teamId === selectedTeamId);
    }
    return empList.map((e) => ({
      label: `${e.fullName} (${e.employeeCode})`,
      value: e.id,
    }));
  }, [filterOptions, selectedTeamId]);

  const projectOptions = useMemo(() => {
    return (filterOptions?.projects || []).map((p) => ({
      label: p.name,
      value: p.id,
    }));
  }, [filterOptions]);

  // When Department changes, reset Team and Employee if they don't match
  const handleDepartmentChange = (val?: string) => {
    setSelectedDepartment(val);
    setSelectedTeamId(undefined);
    setSelectedEmployeeId(undefined);
  };

  const handleTeamChange = (val?: string) => {
    setSelectedTeamId(val);
    setSelectedEmployeeId(undefined);
  };

  return {
    selectedDepartment,
    setSelectedDepartment,
    selectedTeamId,
    setSelectedTeamId,
    selectedEmployeeId,
    setSelectedEmployeeId,
    selectedProjectId,
    setSelectedProjectId,
    selectedStatus,
    setSelectedStatus,
    searchKeyword,
    setSearchKeyword,
    debouncedSearch,
    setDebouncedSearch,
    filterOptions,
    departmentOptions,
    teamOptions,
    employeeOptions,
    projectOptions,
    handleDepartmentChange,
    handleTeamChange,
  };
};
