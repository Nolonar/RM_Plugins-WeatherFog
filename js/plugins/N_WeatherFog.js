/* 
 * MIT License
 * 
 * Copyright (c) 2020 Nolonar
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

//=============================================================================
// Metadata
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Adds fog weather effects.
 * @author Nolonar
 * @url https://github.com/Nolonar/RM_Plugins
 * 
 * @param fogQuality
 * @text Fog quality
 * @desc The quality of the fog (1-8). Higher values improve quality but may reduce performance.
 * @type number
 * @min 1
 * @max 8
 * @default 4
 * 
 * @param fogSpeed
 * @text Fog speed
 * @desc The speed at which the fog moves. If 0, the fog will not move at all.
 * @type number
 * @min 0
 * @decimals 3
 * @default 0.25
 * 
 * @param xScale
 * @text X scaling
 * @desc The scaling of the fog map in horizontal direction. Higher values make the fog look more spread out.
 * @type number
 * @min 1
 * @default 400
 * 
 * @param yScale
 * @text Y scaling
 * @desc The scaling of the fog map in vertical direction. Higher values make the fog look more spread out.
 * @type number
 * @min 1
 * @default 150
 * 
 * @command fog
 * @text Fog
 * @desc Changes current weather to fog. Use the "Set Weather Effect..." event command to remove the fog again.
 * 
 * @arg intensity
 * @text Intensity
 * @desc The intensity of the fog. At 0, the fog is invisible. Values over 1 are possible, but not recommended.
 * @type number
 * @min 0
 * @decimals 3
 * @default 0.75
 * 
 * @arg fadeInDuration
 * @text Fade-in duration
 * @desc How many frames until the fog is at full intensity.
 * @type number
 * @min 0
 * @default 60
 * 
 * @arg isWait
 * @text Wait for completion
 * @desc If ON, event will wait until fog is at full intensity before resuming.
 * @type boolean
 * @default true
 * 
 * 
 * @help Version 1.2.2
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 * Fog
 *      Changes current weather to fog. Use the "Set Weather Effect..." event
 *      command to remove the fog again.
 */

(() => {
    const PLUGIN_NAME = "N_WeatherFog";

    const WEATHER_TYPE_FOG = "fog";

    let parameters = PluginManager.parameters(PLUGIN_NAME);
    parameters.fogQuality = Math.floor(Number(parameters.fogQuality)) || 4;
    parameters.fogSpeed = parameters.fogSpeed === "0" ? 0 : (Number(parameters.fogSpeed) || 2);
    parameters.xScale = Number(parameters.xScale) || 400;
    parameters.yScale = Number(parameters.yScale) || 150;

    PluginManager.registerCommand(PLUGIN_NAME, WEATHER_TYPE_FOG, function (args) {
        const intensity = args.intensity === "0" ? 0 : (Number(args.intensity) || 0.75);
        const fadeInDuration = args.fadeInDuration === "0" ? 0 : (Number(args.fadeInDuration) || 60);
        const isWait = args.isWait !== "false";

        $gameScreen.changeWeather(WEATHER_TYPE_FOG, intensity, fadeInDuration);
        if (isWait)
            this.wait(fadeInDuration);
    });

    let Game_Screen_changeWeather = Game_Screen.prototype.changeWeather;
    Game_Screen.prototype.changeWeather = function (type, power, duration) {
        const isChangingToFog = type === WEATHER_TYPE_FOG;
        Game_Screen_changeWeather.call(this, isChangingToFog ? "none" : type, power, duration);

        fog.targetIntensity = isChangingToFog ? power : 0;
        fog.fadeDuration = isChangingToFog || fog.isActive ? duration : 0;
    }

    Weather = class Weather_Ext extends Weather {
        get mapSpriteset() { return SceneManager._scene._spriteset; }
        get mapFilters() { return this.mapSpriteset.filters; }
        get originDelta() {
            return {
                x: this.origin.x - this.previousOrigin.x,
                y: this.origin.y - this.previousOrigin.y
            };
        }

        _updateAllSprites() {
            super._updateAllSprites();
            this.updateFog();
        }

        updateFog() {
            if (!this.previousOrigin)
                this.rememberOrigin();

            this.updateFogUniforms();
            this.rememberOrigin();

            if (!fog.isActive)
                this.mapFilters.remove(fog.filter)
            else if (!this.mapFilters.some(f => f === fog.filter))
                this.mapFilters.push(fog.filter);
        }

        updateFogUniforms() {
            const posDelta = this.correctOriginDelta(this.originDelta);

            fog.uniforms.uTime = performance.now() / 1000 * parameters.fogSpeed;
            fog.uniforms.uOrigin.x += posDelta.x;
            fog.uniforms.uOrigin.y += posDelta.y;
            fog.uniforms.uIntensity = fog.fadeDuration ? this.getFogIntensity() : fog.targetIntensity;
        }

        getFogIntensity() {
            const d = fog.fadeDuration--;
            const t = fog.targetIntensity;
            return (fog.uniforms.uIntensity * (d - 1) + t) / d;
        }

        rememberOrigin() {
            this.previousOrigin = {
                x: this.origin.x,
                y: this.origin.y
            };
        }

        correctOriginDelta(posDelta) {
            const tilemap = this.mapSpriteset._tilemap;
            const scale = {
                x: tilemap?._tileWidth,
                y: tilemap?._tileHeight
            }
            for (const axis of ["x", "y"]) {
                const dpf = $gamePlayer.distancePerFrame() * scale[axis];
                const getCorrectDelta = d => d > dpf ? -dpf : d < -dpf ? dpf : d;
                posDelta[axis] = getCorrectDelta(posDelta[axis]);
            }

            return posDelta;
        }
    }

    const fog = new class WeatherFog {
        constructor() {
            this.uniforms = {
                uTime: 0,
                uOrigin: {
                    x: 0,
                    y: 0
                },
                uIntensity: 0
            };
            this.filter = new PIXI.Filter(null, this.fragment, this.uniforms);
            this.targetIntensity = 0;
            this.fadeDuration = 0;
        }

        get isActive() {
            return !!this.uniforms.uIntensity;
        }

        get fragment() {
            // Perlin noise shader implementation taken from
            // https://observablehq.com/@mbostock/perlin-noise/2
            return `precision highp float;

            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;

            uniform float uTime;
            uniform vec2 uOrigin;
            uniform float uIntensity;

            const int octaves = ${parameters.fogQuality};
            const vec2 noiseScale = vec2(${parameters.xScale}, ${parameters.yScale});

            vec4 permute(vec4 x) {
                return mod((x * 34.0 + 1.0) * x, 289.0);
            }

            vec4 taylorInvSqrt(vec4 r) {
                return 1.79284291400159 - 0.85373472095314 * r;
            }

            float snoise(vec3 v) {
                const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                i = mod(i, 289.0);
                vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                vec3 ns = D.wyz / 7.0 - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);
                vec4 s0 = floor(b0) * 2.0 + 1.0;
                vec4 s1 = floor(b1) * 2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
                m *= m;
                return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
            }

            float onoise(vec3 v) {
                float total = 0.0;
                float frequency = 1.0;
                float amplitude = 1.0;
                float maxValue = 0.0;
                for (int i = 0; i < octaves; i++) {
                    total += snoise(v * frequency) * amplitude;
                    maxValue += amplitude;
                    amplitude *= 0.5;
                    frequency *= 2.0;
                }
                return total / maxValue;
            }

            void main() {
                vec4 sample = texture2D(uSampler, vTextureCoord);
                vec2 coord = gl_FragCoord.xy + uOrigin;
                vec4 noise = vec4(vec3((onoise(vec3(coord / noiseScale, uTime)) + 1.0) / 2.0), 1.0);

                gl_FragColor = sample + noise * uIntensity;
            }`;
        }
    }();
})();
