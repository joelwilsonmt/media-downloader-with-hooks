import type { Job, ServerEvent } from '@shared/schemas';
import { useEffect, useReducer, useState } from 'react';

type State = Map<string, Job>;

function reducer(state: State, event: ServerEvent): State {
  if (event.type === 'snapshot') return new Map(event.jobs.map(j => [j.id, j]));
  const next = new Map(state);
  if (event.type === 'job') next.set(event.job.id, event.job);
  else event.ids.forEach(id => next.delete(id));
  return next;
}

export type Connection = 'connecting' | 'open' | 'lost';

/** Live job list over Server-Sent Events. EventSource reconnects by itself. */
export function useJobs() {
  const [jobs, dispatch] = useReducer(reducer, new Map());
  const [connection, setConnection] = useState<Connection>('connecting');

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onopen = () => setConnection('open');
    source.onerror = () =>
      setConnection(
        source.readyState === EventSource.CLOSED ? 'lost' : 'connecting'
      );
    source.onmessage = e => dispatch(JSON.parse(e.data) as ServerEvent);
    return () => source.close();
  }, []);

  return { jobs, connection };
}
