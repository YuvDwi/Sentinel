import React from 'react';

interface ServerLocation {
  name: string;
  x: number; // percentage from left
  y: number; // percentage from top
  status: 'healthy' | 'degraded' | 'error';
}

const WorldMap: React.FC = () => {
  const servers: ServerLocation[] = [
    { name: 'US East', x: 25, y: 40, status: 'healthy' },
    { name: 'US West', x: 15, y: 38, status: 'healthy' },
    { name: 'EU Central', x: 51, y: 32, status: 'healthy' },
    { name: 'EU West', x: 47, y: 30, status: 'degraded' },
    { name: 'Asia Pacific', x: 80, y: 45, status: 'healthy' },
    { name: 'Asia Southeast', x: 73, y: 58, status: 'healthy' },
    { name: 'South America', x: 35, y: 75, status: 'error' },
  ];

  const getStatusColor = (status: ServerLocation['status']) => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'degraded': return '#f59e0b';
      case 'error': return '#ef4444';
    }
  };

  const getStatusPercentage = (status: ServerLocation['status']) => {
    const total = servers.length;
    const count = servers.filter(s => s.status === status).length;
    return Math.round((count / total) * 100);
  };

  return (
    <div className="relative w-full h-full bg-gray-950/50 rounded">
      {/* World map background - using inline SVG for maximum control */}
      <svg 
        viewBox="0 0 360 180" 
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Simplified but recognizable continents */}
        <g fill="#0a0a0a" stroke="#1a1a1a" strokeWidth="0.5">
          {/* North America */}
          <path d="M30,40 Q50,20 80,25 L90,35 Q95,50 85,65 L70,70 Q50,65 40,55 Z" />
          
          {/* South America */}
          <path d="M65,90 Q70,80 75,85 L80,110 Q75,130 70,135 L65,130 Q60,110 65,90 Z" />
          
          {/* Europe */}
          <path d="M175,35 Q185,30 195,35 L190,45 Q185,50 180,48 L175,40 Z" />
          
          {/* Africa */}
          <path d="M175,60 Q185,55 190,65 L185,95 Q180,105 175,100 L170,85 Q170,70 175,60 Z" />
          
          {/* Asia */}
          <path d="M200,30 Q250,25 280,40 L275,65 Q240,70 210,65 L200,50 Q195,35 200,30 Z" />
          
          {/* Australia */}
          <path d="M270,105 Q285,100 295,105 L290,115 Q280,120 270,115 L265,110 Q265,105 270,105 Z" />
        </g>
      </svg>

      {/* Server status dots with better visual hierarchy */}
      {servers.map((server) => (
        <div
          key={server.name}
          className="absolute group"
          style={{ 
            left: `${server.x}%`, 
            top: `${server.y}%`,
            transform: 'translate(-50%, -50%)'
          }}
        >
          {/* Pulsing ring for all servers based on status */}
          <div 
            className={`absolute w-6 h-6 rounded-full ${
              server.status === 'healthy' ? 'animate-ping' : 
              server.status === 'degraded' ? 'animate-pulse' : ''
            }`}
            style={{ 
              backgroundColor: getStatusColor(server.status), 
              opacity: server.status === 'error' ? 0.2 : 0.3 
            }}
          />
          
          {/* Main dot with better visibility */}
          <div 
            className="relative w-3 h-3 rounded-full shadow-lg z-10"
            style={{ 
              backgroundColor: getStatusColor(server.status),
              boxShadow: `0 0 12px ${getStatusColor(server.status)}`,
              border: `1px solid ${getStatusColor(server.status)}`
            }}
          />

          {/* Tooltip on hover */}
          <div className="absolute bottom-full mb-2 px-2 py-1 bg-gray-900 rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            {server.name}
          </div>
        </div>
      ))}

      {/* Status percentages instead of legend */}
      <div className="absolute bottom-2 left-2 flex gap-6 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-gray-400">Healthy</span>
          <span className="text-green-500 font-medium">{getStatusPercentage('healthy')}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-gray-400">Degraded</span>
          <span className="text-orange-500 font-medium">{getStatusPercentage('degraded')}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-gray-400">Error</span>
          <span className="text-red-500 font-medium">{getStatusPercentage('error')}%</span>
        </div>
      </div>
    </div>
  );
};

export default WorldMap;
