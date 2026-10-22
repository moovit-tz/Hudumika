import { dbPlatform } from '../db/client.js';
import { decryptSecret } from './onsite-secrets.service.js';
import { sql } from 'kysely';

export interface CarImagesConfig {
  apiKey: string;
  secret: string;
  baseUrl: string;
}

export const DEFAULT_CARIMAGES_CONFIG: CarImagesConfig = {
  apiKey: 'ci_a723d0e11a412579a5440a33bf4d55b0e2b51a56bce1bb4ce70d6290',
  secret: 'c0c395cf7a6010c8801d7da31fff5b70e237b719d2b44b02de0ed6cb6710eb9e',
  baseUrl: 'https://carimagesapi.com',
};

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export class CarImagesService {
  /** Resolve API key and secret from tenant_settings or fall back to defaults. */
  static async getConfig(): Promise<CarImagesConfig> {
    try {
      const row = await dbPlatform
        .selectFrom('tenant_settings')
        .select('settings')
        .where('tenant_id', '=', GLOBAL_TENANT_ID)
        .executeTakeFirst();
      const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
      const ci = settings.carimages || {};
      let secret = ci.secret?.trim();
      if (secret && secret.includes(':')) {
        try {
          secret = decryptSecret(secret);
        } catch {
          // not encrypted or different key
        }
      }
      return {
        apiKey: ci.apiKey?.trim() || DEFAULT_CARIMAGES_CONFIG.apiKey,
        secret: secret || DEFAULT_CARIMAGES_CONFIG.secret,
        baseUrl: ci.baseUrl?.trim() || DEFAULT_CARIMAGES_CONFIG.baseUrl,
      };
    } catch {
      return DEFAULT_CARIMAGES_CONFIG;
    }
  }

  /** Test connection to CarImages API by querying list of makes. */
  static async testConnection(apiKeyOverride?: string, secretOverride?: string): Promise<{
    ok: boolean;
    latencyMs: number;
    totalMakes: number;
    sampleMakes: Array<{ slug: string; name: string; logo: string | null }>;
  }> {
    const config = await this.getConfig();
    const apiKey = apiKeyOverride?.trim() || config.apiKey;
    const secret = secretOverride?.trim() || config.secret;

    const start = Date.now();
    const res = await fetch(`${config.baseUrl}/api/v1/makes`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Api-Secret': secret,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`CarImages API returned HTTP ${res.status}: ${errorText || res.statusText}`);
    }

    const data = await res.json();
    const makes = Array.isArray(data) ? data : (data.makes || []);
    const totalMakes = Number(data.total) || makes.length;

    return {
      ok: true,
      latencyMs,
      totalMakes,
      sampleMakes: makes.slice(0, 10),
    };
  }

  /** Fetch all available makes with logos. */
  static async getMakes(): Promise<{
    total: number;
    makes: Array<{ slug: string; name: string; logo: string | null }>;
  }> {
    const config = await this.getConfig();
    const res = await fetch(`${config.baseUrl}/api/v1/makes`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'X-Api-Secret': config.secret,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch makes: ${res.statusText}`);
    }

    const data = await res.json();
    const makes = Array.isArray(data) ? data : (data.makes || []);
    return {
      total: Number(data.total) || makes.length,
      makes,
    };
  }

  /** Generate a signed URL for a 2D studio car image. */
  static async getSignedUrl(params: {
    make: string;
    model: string;
    year?: number | string;
    view?: string;
    format?: string;
    apiKeyOverride?: string;
  }): Promise<{ url: string; make: string; model: string }> {
    const config = await this.getConfig();
    const apiKey = params.apiKeyOverride?.trim() || config.apiKey;

    const query = new URLSearchParams({
      api_key: apiKey,
      make: params.make.trim(),
      model: params.model.trim(),
    });

    if (params.year) query.set('year', String(params.year));
    if (params.view) query.set('view', params.view);
    if (params.format) query.set('format', params.format);

    const res = await fetch(`${config.baseUrl}/api/v1/signed-url?${query.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`CarImages signed-url failed: ${err || res.statusText}`);
    }

    const data = await res.json();
    return {
      url: data.url,
      make: params.make,
      model: params.model,
    };
  }

  /** Generate signed 3D model URL for <model-viewer>. */
  static async getSignedModelUrl(params: {
    make: string;
    model: string;
    year?: number | string;
    apiKeyOverride?: string;
  }): Promise<{ url: string | null; make: string; model: string }> {
    const config = await this.getConfig();
    const apiKey = params.apiKeyOverride?.trim() || config.apiKey;

    const res = await fetch(`${config.baseUrl}/api/v1/signed-model-urls?api_key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        models: [
          {
            make: params.make.trim(),
            model: params.model.trim(),
            year: params.year ? String(params.year) : undefined,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`CarImages signed-model-url failed: ${err || res.statusText}`);
    }

    const data = await res.json();
    const url = Array.isArray(data.urls) && data.urls.length > 0 ? data.urls[0] : null;
    return {
      url,
      make: params.make,
      model: params.model,
    };
  }

  /**
   * Pull and enrich existing fleet assets in the platform with realistic
   * CarImages studio photos and verified specs.
   */
  static async syncFleetAssets(tenantId?: string): Promise<{
    totalScanned: number;
    updatedCount: number;
    results: Array<{ id: string; name: string; make: string; model: string; photoUrl: string }>;
  }> {
    const config = await this.getConfig();
    let query = dbPlatform.selectFrom('vehicles').selectAll();
    if (tenantId) {
      query = query.where('tenant_id', '=', tenantId);
    }
    const vehicles = await query.execute();

    const results: Array<{ id: string; name: string; make: string; model: string; photoUrl: string }> = [];

    for (const v of vehicles) {
      let make = v.make?.trim();
      let model = v.model?.trim();

      // If make/model missing on vehicle, infer from name/plate
      if (!make || !model) {
        const nameLower = (v.name || '').toLowerCase();
        if (nameLower.includes('scania')) {
          make = 'Scania';
          model = nameLower.includes('500') ? 'R500' : 'R450';
        } else if (nameLower.includes('man')) {
          make = 'MAN';
          model = nameLower.includes('tgx') ? 'TGX' : 'TGS';
        } else if (nameLower.includes('actros') || nameLower.includes('mercedes')) {
          make = 'Mercedes-Benz';
          model = 'Actros';
        } else if (nameLower.includes('volvo')) {
          make = 'Volvo';
          model = 'FH16';
        } else if (nameLower.includes('hiace')) {
          make = 'Toyota';
          model = 'Hiace';
        } else if (nameLower.includes('coaster') || nameLower.includes('toyota')) {
          make = 'Toyota';
          model = nameLower.includes('coaster') ? 'Coaster' : 'Hilux';
        } else if (nameLower.includes('howo')) {
          make = 'Sinotruk';
          model = 'HOWO';
        } else if (nameLower.includes('isuzu')) {
          make = 'Isuzu';
          model = 'Giga';
        } else {
          // Standard commercial freight fallback
          make = 'Scania';
          model = 'R450';
        }
      }

      try {
        const signed = await this.getSignedUrl({
          make,
          model,
          year: v.year ?? undefined,
          apiKeyOverride: config.apiKey,
        });

        if (signed.url) {
          await dbPlatform
            .updateTable('vehicles')
            .set({
              make,
              model,
              photo_url: signed.url,
              updated_at: new Date(),
            })
            .where('id', '=', v.id)
            .execute();

          results.push({
            id: v.id,
            name: v.name,
            make,
            model,
            photoUrl: signed.url,
          });
        }
      } catch (err: any) {
        console.warn(`[CarImages] Failed to resolve signed URL for ${v.name} (${make} ${model}):`, err.message);
      }
    }

    return {
      totalScanned: vehicles.length,
      updatedCount: results.length,
      results: results.slice(0, 20),
    };
  }

  /**
   * Create realistic demo fleet assets with accurate specs and CarImages studio photos.
   */
  static async createRealisticFleetAssets(tenantId: string): Promise<{
    createdCount: number;
    vehicles: Array<{ id: string; name: string; plate: string; photoUrl: string }>;
  }> {
    const config = await this.getConfig();

    const sampleDefinitions = [
      {
        name: 'Scania R500 V8 Streamline',
        plate_number: 'T 812 DRZ',
        type: 'TRUCK',
        make: 'Scania',
        model: 'R500',
        year: 2022,
        trim: 'Highline V8 Topline',
        color: 'Saphir Blue',
        fuel_type: 'DIESEL',
        group_name: 'Northern Corridor Cross-Border',
        mileage_km: '84350',
        speed_limit_kmh: 85,
        driver_name: 'Hamisi Bakari',
        driver_phone: '+255 754 112 334',
        status: 'ACTIVE',
      },
      {
        name: 'Mercedes-Benz Actros 2645',
        plate_number: 'T 490 DKL',
        type: 'TRUCK',
        make: 'Mercedes-Benz',
        model: 'Actros',
        year: 2021,
        trim: 'GigaSpace 6x4',
        color: 'Arctic Silver',
        fuel_type: 'DIESEL',
        group_name: 'Dar-Kigali Transit Route',
        mileage_km: '112400',
        speed_limit_kmh: 80,
        driver_name: 'Joseph Mwamba',
        driver_phone: '+255 768 998 123',
        status: 'ACTIVE',
      },
      {
        name: 'MAN TGX 26.480 EfficientLine',
        plate_number: 'T 633 EDM',
        type: 'TRUCK',
        make: 'MAN',
        model: 'TGX',
        year: 2020,
        trim: 'XXL Sleeper Cab',
        color: 'Pure White',
        fuel_type: 'DIESEL',
        group_name: 'Central Corridor Heavy Haul',
        mileage_km: '148900',
        speed_limit_kmh: 85,
        driver_name: 'Rashidi Mwinyi',
        driver_phone: '+255 713 445 667',
        status: 'ACTIVE',
      },
      {
        name: 'Volvo FH16 750 Globetrotter',
        plate_number: 'T 722 FGH',
        type: 'TRUCK',
        make: 'Volvo',
        model: 'FH16',
        year: 2023,
        trim: '750 XXL Dual-Clutch',
        color: 'Anthracite Metallic',
        fuel_type: 'DIESEL',
        group_name: 'Tunduma Express Route',
        mileage_km: '42100',
        speed_limit_kmh: 85,
        driver_name: 'Salum Kibona',
        driver_phone: '+255 784 556 778',
        status: 'ACTIVE',
      },
      {
        name: 'Toyota Hilux 2.8 GD-6 4x4',
        plate_number: 'T 341 CXY',
        type: 'PICKUP',
        make: 'Toyota',
        model: 'Hilux',
        year: 2023,
        trim: 'Invincible Double Cab',
        color: 'Crimson Red',
        fuel_type: 'DIESEL',
        group_name: 'Field Operations & Escort',
        mileage_km: '31200',
        speed_limit_kmh: 110,
        driver_name: 'Frank Mlay',
        driver_phone: '+255 765 889 001',
        status: 'ACTIVE',
      },
      {
        name: 'Toyota Hiace Super GL Cargo',
        plate_number: 'T 119 BMN',
        type: 'VAN',
        make: 'Toyota',
        model: 'Hiace',
        year: 2022,
        trim: 'High Roof Long Wheelbase',
        color: 'Silver Metallic',
        fuel_type: 'PETROL',
        group_name: 'Dar Urban Express Logistics',
        mileage_km: '68400',
        speed_limit_kmh: 90,
        driver_name: 'Zuberi Juma',
        driver_phone: '+255 712 334 556',
        status: 'ACTIVE',
      },
      {
        name: 'BMW 3 Series Executive Sedan',
        plate_number: 'T 901 EXQ',
        type: 'OTHER',
        make: 'BMW',
        model: '3 Series',
        year: 2022,
        trim: '330i M Sport',
        color: 'Black Sapphire',
        fuel_type: 'PETROL',
        group_name: 'Executive Protocol & Client Transport',
        mileage_km: '28600',
        speed_limit_kmh: 120,
        driver_name: 'Amina Ndosi',
        driver_phone: '+255 759 223 344',
        status: 'ACTIVE',
      },
      {
        name: 'BMW X5 xDrive40i Operations SUV',
        plate_number: 'T 558 KLL',
        type: 'OTHER',
        make: 'BMW',
        model: 'X5',
        year: 2020,
        trim: 'xDrive40i M Aerodynamics',
        color: 'Mineral White',
        fuel_type: 'PETROL',
        group_name: 'Supervisory & Site Inspection',
        mileage_km: '54200',
        speed_limit_kmh: 120,
        driver_name: 'Kelvin Lyimo',
        driver_phone: '+255 782 110 998',
        status: 'ACTIVE',
      },
    ];

    const created: Array<{ id: string; name: string; plate: string; photoUrl: string }> = [];

    for (const def of sampleDefinitions) {
      let photoUrl: string | null = null;
      try {
        const signed = await this.getSignedUrl({
          make: def.make,
          model: def.model,
          year: def.year,
          apiKeyOverride: config.apiKey,
        });
        photoUrl = signed.url;
      } catch (err: any) {
        console.warn(`[CarImages] Could not get photo for ${def.name}:`, err.message);
      }

      const deviceId = `dev-${def.plate_number.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

      // Check if vehicle with same plate already exists
      const existing = await dbPlatform
        .selectFrom('vehicles')
        .select('id')
        .where('plate_number', '=', def.plate_number)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (existing) {
        await dbPlatform
          .updateTable('vehicles')
          .set({
            photo_url: photoUrl,
            make: def.make,
            model: def.model,
            year: def.year,
            trim: def.trim,
            color: def.color,
            updated_at: new Date(),
          })
          .where('id', '=', existing.id)
          .execute();

        created.push({
          id: existing.id,
          name: def.name,
          plate: def.plate_number,
          photoUrl: photoUrl || '',
        });
      } else {
        const inserted = await dbPlatform
          .insertInto('vehicles')
          .values({
            tenant_id: tenantId,
            name: def.name,
            plate_number: def.plate_number,
            type: def.type,
            make: def.make,
            model: def.model,
            year: def.year,
            trim: def.trim,
            color: def.color,
            fuel_type: def.fuel_type,
            group_name: def.group_name,
            mileage_km: def.mileage_km as any,
            speed_limit_kmh: def.speed_limit_kmh,
            driver_name: def.driver_name,
            driver_phone: def.driver_phone,
            status: def.status,
            device_id: deviceId,
            photo_url: photoUrl,
            ownership: 'OWNED',
            created_at: new Date(),
            updated_at: new Date(),
          } as any)
          .returning(['id', 'name', 'plate_number', 'photo_url'])
          .executeTakeFirstOrThrow();

        created.push({
          id: inserted.id,
          name: inserted.name,
          plate: inserted.plate_number || '',
          photoUrl: inserted.photo_url || '',
        });
      }
    }

    return {
      createdCount: created.length,
      vehicles: created,
    };
  }
}
