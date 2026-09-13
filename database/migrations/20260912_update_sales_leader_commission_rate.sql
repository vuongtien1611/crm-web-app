-- Migration: Update SALES_TEAM_LEADER personal closing sale commission rate to 4% (0.0400)
DO $$
DECLARE
    v_pos_tl BIGINT;
BEGIN
    SELECT id INTO v_pos_tl FROM positions WHERE code = 'SALES_TEAM_LEADER';
    IF v_pos_tl IS NOT NULL THEN
        UPDATE commission_policies
        SET rate = 0.0400,
            policy_name = 'Chính Sách Hoa Hồng Closing Sale (Vị trí SALES_TEAM_LEADER)'
        WHERE policy_type = 'SALE'
          AND position_id = v_pos_tl
          AND service_id IS NULL
          AND assignee_count IS NULL;
    END IF;
END $$;
