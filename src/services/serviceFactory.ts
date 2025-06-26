import { 
  IPersistenceService, 
  IScreenerEngine, 
  IAnalysisEngine, 
  IMonitoringEngine,
  ServiceConfig 
} from '../abstractions/interfaces';
import { BrowserScreenerEngine } from '../implementations/browser/browserScreenerEngine';
import { BrowserAnalysisEngine } from '../implementations/browser/browserAnalysisEngine';
// Import other browser implementations as we create them
// import { BrowserPersistenceService } from '../implementations/browser/browserPersistenceService';
// import { BrowserMonitoringEngine } from '../implementations/browser/browserMonitoringEngine';

// Future cloud implementations
// import { CloudScreenerEngine } from '../implementations/cloud/cloudScreenerEngine';
// import { CloudPersistenceService } from '../implementations/cloud/cloudPersistenceService';

export class ServiceFactory {
  private static userTier: 'free' | 'pro' | 'premium' = 'free';
  
  static setUserTier(tier: 'free' | 'pro' | 'premium') {
    this.userTier = tier;
  }

  static getConfig(): ServiceConfig {
    const configs: Record<string, ServiceConfig> = {
      free: {
        tier: 'free',
        features: {
          maxStrategies: 3,
          maxWatchlistItems: 10,
          maxActiveTrades: 5,
          realtimeAlerts: false,
          cloudExecution: false,
          apiTrading: false,
        },
      },
      pro: {
        tier: 'pro',
        features: {
          maxStrategies: 10,
          maxWatchlistItems: 50,
          maxActiveTrades: 20,
          realtimeAlerts: true,
          cloudExecution: false,
          apiTrading: false,
        },
      },
      premium: {
        tier: 'premium',
        features: {
          maxStrategies: -1, // Unlimited
          maxWatchlistItems: -1,
          maxActiveTrades: -1,
          realtimeAlerts: true,
          cloudExecution: true,
          apiTrading: true,
        },
      },
    };

    return configs[this.userTier];
  }

  static getPersistence(): IPersistenceService {
    // Always use Supabase for persistence
    // return new BrowserPersistenceService();
    throw new Error('PersistenceService not implemented yet');
  }

  static getScreener(): IScreenerEngine {
    const config = this.getConfig();
    
    if (config.features.cloudExecution && this.userTier === 'premium') {
      // Future: return new CloudScreenerEngine();
      console.log('Cloud screener would be used for premium tier');
    }
    
    return new BrowserScreenerEngine();
  }

  static getAnalysis(): IAnalysisEngine {
    return new BrowserAnalysisEngine();
  }

  static getMonitoring(): IMonitoringEngine {
    const config = this.getConfig();
    
    if (config.features.cloudExecution && this.userTier === 'premium') {
      // Future: return new CloudMonitoringEngine();
      console.log('Cloud monitoring would be used for premium tier');
    }
    
    // return new BrowserMonitoringEngine();
    throw new Error('MonitoringEngine not implemented yet');
  }

  // Helper method to check feature availability
  static canUseFeature(feature: keyof ServiceConfig['features']): boolean {
    const config = this.getConfig();
    const value = config.features[feature];
    return typeof value === 'boolean' ? value : value > 0;
  }

  // Helper method to check limits
  static getFeatureLimit(feature: keyof ServiceConfig['features']): number | boolean {
    const config = this.getConfig();
    return config.features[feature];
  }
}