"use client";

import { useState, useEffect, useContext, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import StationImage from "@/components/StationImage";
import { BarChart3, Bell } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import CustomTooltip from "@/components/ui/CustomTooltip";
import { useTranslatedPageTitle } from '@/hooks/useTranslatedPageTitle';
import { SidebarHeaderContext } from "@/contexts/SidebarHeaderContext";
import { useTranslation } from 'react-i18next';
import { useStations, useStationDailyData, useStationHourlyData, useStation10MinData } from "@/hooks/useStations";
import { DataTable } from "@/components/ui/DataTable";
import DataSource from "@/components/DataSource";
import AlertModal from "@/components/AlertModal";
import { useConvexStationAlerts } from "@/hooks/useConvexAlerts";
import { useUser } from "@clerk/nextjs";

interface Station {
  id: string;
  estacao: string;
  loc: string;
  lat: number;
  lon: number;
}

interface MapComponentProps {
  stations: Station[];
  selectedStationId: string | null;
  onMarkerHover: (stationId: string | null) => void;
  onStationSelect: (stationId: string | null) => void;
  showMenu: boolean | null;
}

interface DailyTemperatureData {
  date: string;
  avg: number;
  min: number;
  max: number;
}

interface DailyRawData {
  air_temp_avg?: string | number;
  air_temp_min?: string | number;
  air_temp_max?: string | number;
}

// Dynamic import of map component to avoid SSR issues
const MapComponent = dynamic<MapComponentProps>(
  () => import("@/components/MapComponent"),
  { ssr: false }
);

export default function StationDetailsPage() {
  const params = useParams() as { stationID: string };
  const router = useRouter();
  const { t } = useTranslation();
  const { isSignedIn } = useUser();

  function formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  const today = new Date();
  const defaultToDate = formatDate(today);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const defaultFromDate = formatDate(sevenDaysAgo);

  const [stationID] = useState(params.stationID);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [activeTab, setActiveTab] = useState("daily");
  const [showAlertModal, setShowAlertModal] = useState(false);

  // Scroll to top when tab changes to prevent jarring scroll shifts (but not on initial load)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  });

  // Use React Query hooks instead of direct fetching
  const { data: stations = [], isLoading: stationsLoading, error: stationsError } = useStations();
  const { data: dailyDataRaw, isLoading: dailyLoading, error: dailyError } = useStationDailyData(stationID, fromDate, toDate);
  const { data: hourlyData = {}, isLoading: hourlyLoading, error: hourlyError } = useStationHourlyData(stationID);
  const { data: min10Data = {}, isLoading: min10Loading, error: min10Error } = useStation10MinData(stationID);
  const { hasAlerts } = useConvexStationAlerts(stationID);
  
  const { sidebarOpen } = useContext(SidebarHeaderContext);
  
  // Calculate derived state
  const stationName = stations.find(s => s.id === stationID)?.estacao.slice(7) || t('common.unknown');
  
  // Transform daily data for the chart
  const dailyData: DailyTemperatureData[] = dailyDataRaw 
    ? Object.entries(dailyDataRaw).map(([date, data]) => ({
        date,
        max: Number((data as DailyRawData).air_temp_max ?? 0),
        avg: Number((data as DailyRawData).air_temp_avg ?? 0),
        min: Number((data as DailyRawData).air_temp_min ?? 0),
      }))
    : [];
  
  // Loading state
  const isLoading = stationsLoading || dailyLoading || hourlyLoading || min10Loading;
  
  // Error handling
  const anyError = stationsError || dailyError || hourlyError || min10Error;
  
  // Show loading state after a delay
  const [showLoading, setShowLoading] = useState(false);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isLoading) {
      timeoutId = setTimeout(() => {
        setShowLoading(true);
      }, 500);
    } else {
      setShowLoading(false);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isLoading]);

  useTranslatedPageTitle('title.station', { station: stationName });
  const imageUrl = `/images/${stationID}.png`;

  const [dailyCurrentPage, setDailyCurrentPage] = useState(1);
  const [hourlyCurrentPage, setHourlyCurrentPage] = useState(1);
  const [min10CurrentPage, setMin10CurrentPage] = useState(1);
  const rowsPerPage = 10;
  
  // Handle pagination for different tabs
  const handleDailyPageChange = useCallback((page: number) => {
    setDailyCurrentPage(page);
  }, []);
  
  const handleHourlyPageChange = useCallback((page: number) => {
    setHourlyCurrentPage(page);
  }, []);
  
  const handleMin10PageChange = useCallback((page: number) => {
    setMin10CurrentPage(page);
  }, []);
  
  // Transform daily data for DataTable
  const dailyTableData = useMemo(() => {
    if (!dailyDataRaw) return [];
    
    return Object.entries(dailyDataRaw)
      .map(([date, data]) => ({
        date,
        ...data
      }))
      .sort((a, b) => Number(b.date.slice(8)) - Number(a.date.slice(8)));
  }, [dailyDataRaw]);
  
  // Transform hourly data for DataTable
  const hourlyTableData = useMemo(() => {
    if (!hourlyData || Object.keys(hourlyData).length === 0) return [];
    
    return Object.values(hourlyData)
      .sort((a, b) => Number(b.date.slice(8)) - Number(a.date.slice(8)));
  }, [hourlyData]);
  
  // Transform 10min data for DataTable
  const min10TableData = useMemo(() => {
    if (!min10Data || Object.keys(min10Data).length === 0) return [];
    
    return Object.values(min10Data)
      .sort((a, b) => Number(b.date.slice(8)) - Number(a.date.slice(8)));
  }, [min10Data]);

  const handleStationSelect = useCallback((selectedId: string | null) => {
    if (selectedId) {
      router.push(`/stations/${selectedId}`);
    }
  }, [router]);

  return (
    <div className="overflow-x-hidden">
      <DataSource 
          introTextKey="station.stationDetailIntro"
          textKey="home.dataSource"
          linkKey="home.irristrat"
          linkUrl="https://irristrat.com/new/index.php"
        />
      
        <div className="glass-panel rounded-2xl overflow-hidden mb-8" style={{ border: 'none' }}>
          <div className="relative w-full h-48 sm:h-72 md:h-96">
            <StationImage
              src={imageUrl}
              alt={t('station.imageAlt', { station: stationName })}
              width={1200}
              height={600}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-transparent">
              <div className="absolute bottom-0 left-0 p-4 sm:p-6 md:p-8">
                <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 drop-shadow-lg">{stationName}</h1>
              </div>
              <div className="absolute bottom-2 right-0 p-4 sm:p-6 md:p-8 pb-10">
              {isSignedIn && (
                  <div className="glass-frosted p-2 rounded-lg">
                    <button
                      onClick={() => setShowAlertModal(true)}
                      className={`inline-flex items-center gap-2 text-white px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 ${
                        hasAlerts ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'
                      }`}
                    >
                      <Bell className="w-4 h-4" />
                      <span className="hidden xs:inline">
                        {hasAlerts ? t('notifications.alerts') : t('notifications.alertSettings')}
                      </span>
                      <span className="xs:hidden">
                        {t('notifications.alerts')}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      {/* Main content container */}
      <div className="glass-panel p-2 sm:p-4 -mt-16 relative bg-background" data-main-content>
        
        {/* Station info and map grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-8">
          {/* Temperature trend graph */}
          <div className="lg:col-span-2 glass-panel-visible p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-2">
              <h2 className="text-base sm:text-lg lg:text-xl text-gray700 font-extrabold">{t('station.dailyTemperatureTrend')}</h2>
              <div className="flex gap-2">
      
                <div className="glass-frosted p-2 rounded-lg">
                  <a 
                    className="inline-flex items-center gap-2 bg-primary text-white px-3 sm:px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105" 
                    href={`/stations/${stationID}/graphs`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span className="hidden xs:inline">{t('station.viewMoreGraphs')}</span>
                    <span className="xs:hidden">{t('station.viewGraphs')}</span>
                  </a>
                </div>
              </div>
            </div>
            <div className="h-[200px] sm:h-[250px] lg:h-[300px] overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={dailyData}
                  margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                >
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => {
                      const [year, month, day] = date.split('-');
                      return `${day}-${month}-${year.slice(2)}`;
                    }}
                    style={{ fontSize: '10px', fill: 'var(--gray-700)', fontWeight: 'bold'}}
                    interval="preserveStartEnd"
                  />
                  <YAxis style={{ fontSize: '10px', fill: 'var(--gray-700)', fontWeight: 'bold'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend style={{ fontSize: '10px', fill: 'var(--gray-700)' , fontWeight: 'bold'}} />
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-400)" />
                  <Line type="monotone" dataKey="max" stroke="#ff7300" name={t('station.chart.maximum')} strokeWidth={2} />
                  <Line type="monotone" dataKey="avg" stroke="#8884d8" name={t('station.chart.average')} strokeWidth={2} />
                  <Line type="monotone" dataKey="min" stroke="#82ca9d" name={t('station.chart.minimum')} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Map section */}
          <div className="glass-panel-visible p-3 sm:p-6">
            <h2 className="text-base sm:text-lg lg:text-xl font-extrabold text-gray700 mb-4">{t('station.location')}</h2>
            <div className="h-48 sm:h-72 rounded-xl overflow-hidden border border-gray700/20 dark:border-gray700/10">
              {stations.length > 0 ? (
                <MapComponent
                  key={sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}
                  stations={stations}
                  selectedStationId={stationID}
                  onMarkerHover={() => {}}
                  onStationSelect={handleStationSelect}
                  showMenu={false}
                />
              ) : (
                <div className="w-full h-full glass-light flex items-center justify-center">
                  <p className="text-gray700 text-sm">{t('station.loadingMap')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
          {/* Navigation tabs */}
          <div className="border-b mb-2 sm:mb-6 -mx-2 sm:mx-0">
            <nav className="flex px-2 sm:px-0">
              <button
                onClick={() => setActiveTab("daily")}
                className={`flex-1 sm:flex-none py-2 sm:py-4 px-2 sm:px-4 border-b-2 font-medium text-xs sm:text-sm text-center ${
                  activeTab === "daily"
                    ? "border-primary text-primary"
                    : "border-transparent text-gray600 hover:text-gray700 hover:border-gray300"
                }`}
              >
                {t('station.tabs.daily')}
              </button>
              <button
                onClick={() => setActiveTab("hourly")}
                className={`flex-1 sm:flex-none py-2 sm:py-4 px-2 sm:px-4 border-b-2 font-medium text-xs sm:text-sm text-center ${
                  activeTab === "hourly"
                    ? "border-primary text-primary"
                    : "border-transparent text-gray600 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {t('station.tabs.hourly')}
              </button>
              <button
                onClick={() => setActiveTab("min10")}
                className={`flex-1 sm:flex-none py-2 sm:py-4 px-2 sm:px-4 border-b-2 font-medium text-xs sm:text-sm text-center ${
                  activeTab === "min10"
                    ? "border-primary text-primary"
                    : "border-transparent text-gray600 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {t('station.tabs.min10')}
              </button>
            </nav>
          </div>

          {/* Error state */}
          {anyError && (
            <div className="text-red-600 mb-4 p-2 sm:p-4 bg-red-50 rounded-lg border border-red-200 text-sm">
              {anyError instanceof Error ? anyError.message : t('common.error')}
            </div>
          )}

          {/* Render tab content based on active tab */}
          <div
            className={`${
              activeTab === "daily" ? "block" : "hidden"
            } flex-1`}
          >
            <div className="pb-2 sm:pb-4">
              {/* Date selector */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                  <span className="text-xs sm:text-sm text-gray600 whitespace-nowrap">{t('station.dateRange.startDate')}</span>
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="flex-1 sm:flex-none px-2 py-1 text-xs sm:text-sm border border-lightGray rounded focus:outline-none focus:ring-1 focus:ring-primary bg-background text-darkGray min-w-0"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                  <span className="text-xs sm:text-sm text-gray600 whitespace-nowrap">{t('station.dateRange.endDate')}</span>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    max={formatDate(new Date())}
                    onChange={(e) => setToDate(e.target.value)}
                    className="flex-1 sm:flex-none px-2 py-1 text-xs sm:text-sm border border-lightGray rounded focus:outline-none focus:ring-1 focus:ring-primary bg-background text-darkGray min-w-0"
                  />
                </div>
              </div>

              {/* Loading indicator below date selector */}
              {showLoading && (
                <div className="flex items-center justify-center gap-2 text-sm text-darkGray py-4">
                  <div className="animate-spin h-5 w-5 border-2 border-t-primary rounded-full"></div>
                  {t('common.loading')}...
                </div>
              )}

              {dailyDataRaw && Object.keys(dailyDataRaw).length > 0 ? (
                <DataTable
                  data={dailyTableData}
                  currentPage={dailyCurrentPage}
                  onPageChange={handleDailyPageChange}
                  rowsPerPage={rowsPerPage}
                  columns={[
                    {
                      key: 'date',
                      header: t('station.table.date'),
                    },
                    {
                      key: 'air_temp_avg',
                      header: t('station.table.avgTemp'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'air_temp_min',
                      header: t('station.table.minTemp'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'air_temp_max',
                      header: t('station.table.maxTemp'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'relative_humidity_avg',
                      header: t('station.table.humidity'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'wind_speed_avg',
                      header: t('station.table.wind'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'solar_radiation_avg',
                      header: t('station.table.radiation'),
                      render: (value: unknown) => String(value || "N/A")
                    }
                  ]}
                  mobileCardRenderer={(item) => (
                    <div className="glass-card p-2 border border-gray700">
                      <h4 className="font-semibold text-sm text-gray700 mb-3">{item.date}</h4>
                      <div className="grid grid-cols-2 gap-3 text-[12px]">
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.avgTemp')}</span>
                          <span className="font-medium text-gray700">{item.air_temp_avg || "N/A"}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.minTemp')}</span>
                          <span className="font-medium text-gray700">{item.air_temp_min || "N/A"}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.maxTemp')}</span>
                          <span className="font-medium text-gray700">{item.air_temp_max || "N/A"}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.humidity')}</span>
                          <span className="font-medium text-gray700">{item.relative_humidity_avg || "N/A"}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.wind')}</span>
                          <span className="font-medium text-gray700">{item.wind_speed_avg || "N/A"}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.radiation')}</span>
                          <span className="font-medium text-gray700">{item.solar_radiation_avg || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  )}
                />
              ) : (
                !isLoading && (
                  <div className="bg-background p-4 sm:p-8 rounded-lg border text-center shadow text-sm">
                    {t('common.noData')}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Hourly Data Tab */}
          <div
            className={`${
              activeTab === "hourly" ? "block" : "hidden"
            } flex-1`}
          >
            <div>

              {hourlyData && Object.keys(hourlyData).length > 0 ? (
                <DataTable
                  data={hourlyTableData}
                  currentPage={hourlyCurrentPage}
                  onPageChange={handleHourlyPageChange}
                  rowsPerPage={rowsPerPage}
                  columns={[
                    {
                      key: 'hour',
                      header: t('station.table.hour'),
                      render: (value: unknown) => String(value).substring(0, 5)|| "N/A"
                    },
                    {
                      key: 'date',
                      header: t('station.table.date'),
                    },
                  
                    {
                      key: 'air_temp_avg',
                      header: t('station.table.avgTemp'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'air_temp_min',
                      header: t('station.table.minTemp'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'air_temp_max',
                      header: t('station.table.maxTemp'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'relative_humidity_avg',
                      header: t('station.table.humidity'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'wind_speed_avg',
                      header: t('station.table.wind'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'solar_radiation_avg',
                      header: t('station.table.radiation'),
                      render: (value: unknown) => String(value || "N/A")
                    }
                  ]}
                  mobileCardRenderer={(row) => (
                    <div className="glass-card p-2 border border-gray700">
                      <h4 className="font-semibold text-sm text-gray700 mb-3">{row.date} - {row.hour}</h4>
                      <div className="grid grid-cols-2 gap-3 text-[12px]">
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.avgTemp')}</span>
                          <span className="font-medium text-gray700">{row.air_temp_avg}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.minTemp')}</span>
                          <span className="font-medium text-gray700">{row.air_temp_min}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.maxTemp')}</span>
                          <span className="font-medium text-gray700">{row.air_temp_max}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.humidity')}</span>
                          <span className="font-medium text-gray700">{row.relative_humidity_avg}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.wind')}</span>
                          <span className="font-medium text-gray700">{row.wind_speed_avg}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.radiation')}</span>
                          <span className="font-medium text-gray700">{row.solar_radiation_avg}</span>
                        </div>
                      </div>
                    </div>
                  )}
                />
              ) : (
                !isLoading && (
                  <div className="glass-panel-visible rounded-xl p-8 text-center">
                    <p className="text-gray700">{t('common.noData')}</p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* 10-Minute Data Tab */}
          <div
            className={`${
              activeTab === "min10" ? "block" : "hidden"
            } flex-1`}
          >
            <div>
              {min10Data && Object.keys(min10Data).length > 0 ? (
                <DataTable
                  data={min10TableData}
                  currentPage={min10CurrentPage}
                  onPageChange={handleMin10PageChange}
                  rowsPerPage={rowsPerPage}
                  columns={[
                    {
                      key: 'hour',
                      header: t('station.table.hour'),
                      render: (value: unknown) => String(value).substring(0, 5)|| "N/A"
                    },
                    {
                      key: 'date',
                      header: t('station.table.date')
                    },
                  
                    {
                      key: 'air_temp_avg',
                      header: t('station.table.avgTemp'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'relative_humidity_avg',
                      header: t('station.table.humidity'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'wind_speed_avg',
                      header: t('station.table.wind'),
                      render: (value: unknown) => String(value || "N/A")
                    },
                    {
                      key: 'solar_radiation_avg',
                      header: t('station.table.radiation'),
                      render: (value: unknown) => String(value || "N/A")
                    }
                  ]}
                  mobileCardRenderer={(row) => (
                    <div className="glass-card p-4 border border-gray700/20 dark:border-gray700/10">
                      <h4 className="font-semibold text-sm text-gray700 mb-3">{row.date} - {row.hour}</h4>
                      <div className="grid grid-cols-2 gap-3 text-[12px]">
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.avgTemp')}</span>
                          <span className="font-medium text-gray700">{row.air_temp_avg}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.humidity')}</span>
                          <span className="font-medium text-gray700">{row.relative_humidity_avg}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.wind')}</span>
                          <span className="font-medium text-gray700">{row.wind_speed_avg}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray700 font-bold mb-1">{t('station.table.radiation')}</span>
                          <span className="font-medium text-gray700">{row.solar_radiation_avg}</span>
                        </div>
                    
                      </div>
                    </div>
                  )}
                />
              ) : (
                !isLoading && (
                  <div className="glass-panel-visible rounded-xl p-8 text-center">
                    <p className="text-gray700">{t('common.noData')}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
        
        {/* Alert Modal */}
        {isSignedIn && (
          <AlertModal
            isOpen={showAlertModal}
            onClose={() => setShowAlertModal(false)}
            stationId={stationID}
            stationName={stationName}
          />
        )}
    </div>
  );
}