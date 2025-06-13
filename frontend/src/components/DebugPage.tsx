// src/components/DebugPage.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const DebugPage: React.FC = () => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Wir rufen exakt die Funktion auf, die die GameList verwendet
                const { data: rpcData, error: rpcError } = await supabase.rpc('get_games_for_gamelist_v6');

                if (rpcError) {
                    throw rpcError;
                }
                setData(rpcData);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    return (
        <div className="p-4 font-mono text-xs text-white bg-gray-800">
            <h1 className="text-lg font-bold mb-4 text-yellow-400">Debug Page: Raw Output von get_games_for_gamelist_v6</h1>
            {loading && <p>Loading data...</p>}
            {error && <p className="text-red-500">Error: {error}</p>}
            {data && (
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
};

export default DebugPage;