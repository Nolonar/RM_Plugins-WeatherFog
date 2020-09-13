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
 * @param xScale
 * @text X scaling
 * @desc The scaling of the fog map in horizontal direction. Higher values make the fog look more spread out.
 * @type number
 * @min 0
 * @decimals 3
 * @default 4
 * 
 * @param yScale
 * @text Y scaling
 * @desc The scaling of the fog map in vertical direction. Higher values make the fog look more spread out.
 * @type number
 * @min 0
 * @decimals 3
 * @default 1.5
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
 * @desc How long (in ms) until the fog is at full intensity.
 * @type number
 * @min 0
 * @default 1000
 * 
 * @arg isWait
 * @text Wait for completion
 * @desc If ON, event will wait until fog is at full intensity before resuming.
 * @type boolean
 * @default true
 * 
 * 
 * @help Version 1.0.2
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
    parameters.xScale = Number(parameters.xScale) || 4;
    parameters.yScale = Number(parameters.yScale) || 1.5;

    const fog = {
        isActive: false,
        uniforms: {
            uTime: 0,
            uOriginX: 0,
            uOriginY: 0,
            uIntensity: 0,
            uOpacity: 0
        },
        filter: null,
        fadeDuration: 0,
        fadeTargetTime: 0,
        fadeTimeout: null,
        isFadingIn: false,
        isFadingOut: false
    };

    PluginManager.registerCommand(PLUGIN_NAME, WEATHER_TYPE_FOG, function (args) {
        args.intensity = args.intensity === "0" ? 0 : (Number(args.intensity) || 0.75);
        args.fadeInDuration = args.fadeInDuration === "0" ? 0 : (Number(args.fadeInDuration) || 1000);
        args.isWait = args.isWait !== "false";

        $gameScreen.changeWeather(WEATHER_TYPE_FOG, args.intensity, 0);
        setFogFadeDuration(args.fadeInDuration);
        fog.uniforms.uIntensity = args.intensity;
        fog.isFadingIn = true;

        if (args.isWait) // Convert duration from milliseconds to frame count.
            this.wait(args.fadeInDuration * 60 / 1000);
    });

    function setFogFadeDuration(duration) {
        fog.fadeDuration = duration;
        fog.fadeTargetTime = performance.now() + duration;
    }

    Weather = class Weather_Ext extends Weather {
        initialize() {
            super.initialize();

            fog.filter = new PIXI.Filter(null, this.fogFragment, fog.uniforms);
        }

        _updateAllSprites() {
            if (this.type !== WEATHER_TYPE_FOG) {
                super._updateAllSprites();
                return;
            }

            if ($gameScreen._weatherPowerTarget) {
                clearTimeout(fog.fadeTimeout);
                fog.isFadingOut = false;
            }
            else {
                this.startFogFadeout();
            }

            this.updateFog();
        }

        startFogFadeout() {
            if (fog.isFadingOut)
                return;

            fog.isFadingOut = true;
            // Convert duration from frame count to milliseconds.
            setFogFadeDuration($gameScreen._weatherDuration / 60 * 1000);
            fog.fadeTimeout = setTimeout(() => {
                SceneManager._scene._spriteset.filters.remove(fog.filter);
                fog.isActive = fog.isFadingOut = false;
            }, fog.fadeDuration);
        }

        updateFog() {
            this.tilemap = SceneManager._scene._spriteset._tilemap;
            if (!this.previousOrigin)
                this.rememberOrigin();

            this.updateFogUniforms();
            this.rememberOrigin();

            if (!fog.isActive)
                SceneManager._scene._spriteset.filters.push(fog.filter);

            fog.isActive = true;
        }

        updateFogUniforms() {
            const now = performance.now();
            const posDelta = this.correctOriginDelta(this.getOriginDelta());

            fog.uniforms.uTime = now / 1000;
            fog.uniforms.uOriginX += posDelta.x;
            fog.uniforms.uOriginY += posDelta.y;

            if (fog.isFadingIn || fog.isFadingOut)
                this.updateFogOpacity(now);
        }

        updateFogOpacity(now) {
            const fadeTimeLeft = fog.fadeTargetTime - now;
            let opacity = fog.fadeDuration ? (fog.fadeDuration - fadeTimeLeft) / fog.fadeDuration : 1;
            opacity = opacity.clamp(0, 1);

            if (fog.isFadingOut)
                opacity = 1 - opacity;
            else if (fog.isFadingIn)
                fog.isFadingIn = opacity < 1;

            fog.uniforms.uOpacity = opacity;
        }

        rememberOrigin() {
            this.previousOrigin = {
                x: this.tilemap.origin.x,
                y: this.tilemap.origin.y
            };
        }

        getOriginDelta() {
            return {
                x: this.tilemap.origin.x - this.previousOrigin.x,
                y: this.tilemap.origin.y - this.previousOrigin.y
            };
        }

        correctOriginDelta(posDelta) {
            const scale = {
                x: this.tilemap._tileWidth,
                y: this.tilemap._tileHeight
            }
            for (const axis of ["x", "y"]) {
                const dpf = $gamePlayer.distancePerFrame() * scale[axis];
                const getCorrectDelta = d => d > dpf ? -dpf : d < -dpf ? dpf : d;
                posDelta[axis] = getCorrectDelta(posDelta[axis]);
            }

            return posDelta;
        }

        get fogFragment() {
            // Perlin noise shader implementation taken from https://observablehq.com/@mbostock/perlin-noise/2
            const scale = {
                x: parameters.xScale,//Number.isInteger(parameters.xScale) ? parameters.xScale.toFixed(1) : parameters.xScale,
                y: parameters.yScale//Number.isInteger(parameters.yScale) ? parameters.yScale.toFixed(1) : parameters.yScale
            };
            return `
            precision highp float;

            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;

            uniform float uTime;
            uniform float uOriginX;
            uniform float uOriginY;
            uniform float uIntensity;
            uniform float uOpacity;

            const int octaves = ${parameters.fogQuality};
            const float persistence = 0.5;
            const vec2 noiseScale = vec2(${scale.x}, ${scale.y});

            vec3 mod289(vec3 x) {
                return x - floor(x * (1.0 / 289.0)) * 289.0;
            }

            vec4 mod289(vec4 x) {
                return x - floor(x * (1.0 / 289.0)) * 289.0;
            }

            vec4 permute(vec4 x) {
                return mod289(((x * 34.0) + 1.0) * x);
            }

            vec4 taylorInvSqrt(vec4 r) {
                return 1.79284291400159 - 0.85373472095314 * r;
            }

            float snoise(vec3 v) {
                const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                const float n_ = 1.0 / 7.0;
                vec3 i = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                i = mod289(i);
                vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                vec3  ns = n_ * D.wyz - D.xzx;
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
                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
                m = m * m;
                return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
            }

            float onoise(vec3 v) {
                float total = 0.0;
                float frequency = 1.0;
                float amplitude = 1.0;
                float maxValue = 0.0;
                for (int i = 0; i < octaves; i++) {
                    total += snoise(vec3(v.x / noiseScale.x, v.y / noiseScale.y, v.z) * frequency) * amplitude;
                    maxValue += amplitude;
                    amplitude *= persistence;
                    frequency *= 2.0;
                }
                return total / maxValue;
            }

            void main() {
                vec4 sample = texture2D(uSampler, vTextureCoord);
                vec2 coord = gl_FragCoord.xy + vec2(uOriginX, uOriginY);
                vec4 noise = vec4(vec3((onoise(vec3(coord * 0.01, uTime / 4.0)) + 1.0) / 2.0), 1.0);

                gl_FragColor = sample + noise * uIntensity * uOpacity;
            }`;
        }
    }
})();
