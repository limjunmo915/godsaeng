// 앱 전체가 공유하는 상태와 Supabase 연결
// anon 키는 공개용. 실제 보안은 schema.sql 의 RLS 규칙이 담당.
import { createClient } from '@supabase/supabase-js';

export const sb = createClient(
  'https://ghrjtbznjnvzwqthiahm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdocmp0Ynpuam52endxdGhpYWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Mzc1NDAsImV4cCI6MjEwNzQxMzU0MH0.Q2M1w4dzgmfc28voCetOP4UyOjEwF6ZDqOnC5hC5FMc',
);

export const S = {
  uid: undefined, me: null, crews: [], crewId: null, people: {}, members: {},
  feed: [], feedEnd: false, mine: [], notes: {}, gear: [], urls: {},
  tab: 'feed', rPeriod: 'week', rMetric: 'points', calMonth: null,
  editing: null, newPhotos: [], keptPhotos: [], loginMode: 'in',
  body: { p: null, logs: [] }, meTab: 'stats', bodyMetric: 'weight_kg', q: '', qDay: null,
};

export const $ = s => document.querySelector(s);
export const ok = ({ data, error }) => { if (error) throw error; return data; };
