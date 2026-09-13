import { NavigateFunction } from 'react-router-dom';

/**
 * Checks if the click event was targeted at an interactive control
 * (e.g. Button, Link, Dropdown, Checkbox, Popconfirm, Modal)
 * so that row navigation does not conflict with action triggers.
 */
export function isInteractiveElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, .ant-btn, .ant-dropdown-trigger, .ant-popover, .ant-popconfirm, .ant-modal, .ant-checkbox-wrapper, .ant-switch, .ant-table-selection-column, [role="button"], [data-no-row-click="true"]'
    )
  );
}

/**
 * Generates an onRow handler for an Ant Design Table that navigates to a detail route on row click.
 */
export function createRowNavigateHandler<T>(
  navigate: NavigateFunction,
  getPath: (record: T) => string | null | undefined,
) {
  return (record: T) => ({
    onClick: (e: React.MouseEvent) => {
      if (isInteractiveElement(e.target)) {
        return;
      }
      const path = getPath(record);
      if (path) {
        navigate(path);
      }
    },
    style: { cursor: 'pointer' },
    className: 'vmax-clickable-row',
  });
}

/**
 * Generates an onRow handler for an Ant Design Table that executes a callback (e.g. open view/detail modal) on row click.
 */
export function createRowActionHandler<T>(
  onAction: (record: T) => void,
) {
  return (record: T) => ({
    onClick: (e: React.MouseEvent) => {
      if (isInteractiveElement(e.target)) {
        return;
      }
      onAction(record);
    },
    style: { cursor: 'pointer' },
    className: 'vmax-clickable-row',
  });
}
