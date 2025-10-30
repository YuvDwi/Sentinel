import React from 'react';

interface Region {
  name: string;
  location: string;
  status: 'healthy' | 'degraded' | 'error';
  latency: number;
  uptime: number;
}

const WorldMapImage: React.FC = () => {
  const regions: Region[] = [
    { name: 'US East', location: 'Virginia', status: 'healthy', latency: 12, uptime: 99.99 },
    { name: 'US West', location: 'Oregon', status: 'healthy', latency: 18, uptime: 99.98 },
    { name: 'EU Central', location: 'Frankfurt', status: 'healthy', latency: 45, uptime: 99.97 },
    { name: 'EU West', location: 'Dublin', status: 'healthy', latency: 52, uptime: 99.96 },
    { name: 'Asia Pacific', location: 'Tokyo', status: 'healthy', latency: 120, uptime: 99.95 },
    { name: 'Asia Southeast', location: 'Singapore', status: 'healthy', latency: 95, uptime: 99.96 },
    { name: 'South America', location: 'São Paulo', status: 'healthy', latency: 135, uptime: 99.94 },
  ];

  const getStatusColor = (status: Region['status']) => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'degraded': return '#f59e0b';
      case 'error': return '#ef4444';
    }
  };

  const getStatusBg = (status: Region['status']) => {
    switch (status) {
      case 'healthy': return 'bg-green-500/10';
      case 'degraded': return 'bg-orange-500/10';
      case 'error': return 'bg-red-500/10';
    }
  };

  const getStatusText = (status: Region['status']) => {
    switch (status) {
      case 'healthy': return 'text-green-500';
      case 'degraded': return 'text-orange-500';
      case 'error': return 'text-red-500';
    }
  };

  const getStatusPercentage = (status: Region['status']) => {
    const total = regions.length;
    const count = regions.filter(r => r.status === status).length;
    return Math.round((count / total) * 100);
  };

  return (
    <div className="w-full h-full flex flex-col px-4">
      {/* Region list */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {regions.map((region) => (
          <div
            key={region.name}
            className="p-2 rounded bg-black border border-white/5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <div>
                  <div className="text-xs font-medium text-white">{region.name}</div>
                  <div className="text-[10px] text-gray-500">{region.location}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <div className="text-gray-500">
                  {region.latency}<span className="text-gray-600">ms</span>
                </div>
                <div className="text-gray-500">
                  {region.uptime}<span className="text-gray-600">%</span>
                </div>
                <div 
                  className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                  style={{ 
                    backgroundColor: `${getStatusColor(region.status)}20`,
                    color: getStatusColor(region.status),
                    boxShadow: `0 0 12px ${getStatusColor(region.status)}60, 0 0 6px ${getStatusColor(region.status)}40`
                  }}
                >
                  {region.status.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary footer */}
      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[10px]">
        <div className="flex gap-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-gray-400">{getStatusPercentage('healthy')}%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span className="text-gray-400">{getStatusPercentage('degraded')}%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-gray-400">{getStatusPercentage('error')}%</span>
          </div>
        </div>
        <div className="text-gray-500">{regions.length} regions</div>
      </div>
    </div>
  );
};

export default WorldMapImage;
