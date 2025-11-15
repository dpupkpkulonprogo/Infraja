// Helper functions
function normalizeRuasId(id) {
  return String(id || '').replace(/\s+/g, '').toLowerCase();
}

function matchesRuasId(layerRuasId, searchRuasId) {
  // Exact match
  if (layerRuasId === searchRuasId) {
    return true;
  }
  
  // Extract base number (e.g., "242" from "242.0", "242.1", "242.2")
  var layerBase = layerRuasId.split('.')[0];
  var searchBase = searchRuasId.split('.')[0];
  
  // Match if base numbers are the same (e.g., "242" matches "242.0", "242.1", "242.2")
  if (layerBase === searchBase && layerBase !== '') {
    return true;
  }
  
  // Contains match (fallback)
  return layerRuasId.includes(searchRuasId) || searchRuasId.includes(layerRuasId);
}

function getRuasIdFromLayer(layer) {
  return layer._ruasId || (layer.feature && layer.feature.properties && layer.feature.properties.no_ruas);
}

function removeFromMap(layer) {
  if (layer.removeFrom) {
    layer.removeFrom(map);
  } else if (layer.remove) {
    layer.remove();
  }
}

function setLayerVisible(layer, visible) {
  if (visible) {
    if (!map.hasLayer(layer) && layer.addTo) {
      layer.addTo(map);
    }
    if (layer.setStyle) {
      if (layer instanceof L.Polyline) {
        layer.setStyle({ opacity: 0.9, fillOpacity: 0.9 });
      } else {
        layer.setStyle({ opacity: 0.9 });
      }
    }
    if (layer.setOpacity) {
      layer.setOpacity(1);
    }
  } else {
    if (layer.setStyle) {
      layer.setStyle({ opacity: 0, fillOpacity: 0, weight: 0 });
    }
    removeFromMap(layer);
  }
}

// Initialize
const urlParams = new URLSearchParams(window.location.search);
const ruasId = urlParams.get('ruasId');
const normalizedRuasId = ruasId ? normalizeRuasId(decodeURIComponent(ruasId).replace(/\+/g, ' ').trim()) : null;

var map;
if (ruasId) {
  document.getElementById('map').classList.add('hidden');
  map = L.map('map').setView([-7.826, 110.156], 18);
} else {
  map = L.map('map').setView([-7.826, 110.156], 12);
}

var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

var satelit = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri'
});

var terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  maxZoom: 17,
  attribution: 'Map data © OpenStreetMap contributors, SRTM | Style © OpenTopoMap'
});

var baseMaps = {
  "OpenStreetMap": osm,
  "Satelit": satelit,
  "Terrain": terrain
};

function formatJalanPopup(properties) {
  var html = '<div class="popup-content">' +
    '<div class="popup-title">' + (properties.name || properties.Nama_Ruas || "Ruas Jalan") + '</div>' +
    '<div class="popup-detail">';

  if (properties.no_ruas !== undefined && properties.no_ruas !== null) {
    html += '<strong>No Ruas:</strong> ' + properties.no_ruas + '<br />';
  }
  if (properties.kapanewon) {
    html += '<strong>Kapanewon:</strong> ' + properties.kapanewon + '<br />';
  }
  if (properties.kalurahan) {
    html += '<strong>Kalurahan:</strong> ' + properties.kalurahan + '<br />';
  }
  if (properties.panjang_km) {
    html += '<strong>Panjang:</strong> ' + properties.panjang_km + ' km<br />';
  }
  if (properties.lebar_m) {
    html += '<strong>Lebar:</strong> ' + properties.lebar_m + ' m<br />';
  }

  var surfaceInfo = [];
  if (properties.hotmix_km > 0) {
    surfaceInfo.push('• Hotmix: ' + properties.hotmix_km + ' km');
  }
  if (properties.kerikil_km > 0) {
    surfaceInfo.push('• Kerikil: ' + properties.kerikil_km + ' km');
  }
  if (properties.tanah_km > 0) {
    surfaceInfo.push('• Tanah: ' + properties.tanah_km + ' km');
  }

  if (surfaceInfo.length) {
    html += '<br /><strong>Jenis Permukaan:</strong><br />' + surfaceInfo.join('<br />');
  }

  html += '</div></div>';
  return html;
}

function createMarkerIcon(noRuas, namaRuas, jenis) {
  var displayLabel = noRuas ? noRuas : (namaRuas || 'Ruas');
  var tooltipText = (namaRuas ? namaRuas : 'Ruas') + ' (Titik ' + jenis + ')';
  tooltipText = tooltipText.replace(/"/g, '&quot;');
  var pinClass = jenis.toLowerCase();
  
  var html = '<div class="marker-container" title="' + tooltipText + '">' +
    '<div class="marker-pin ' + pinClass + '"></div>' +
    '<div class="marker-label ' + pinClass + '">' + displayLabel + '</div>' +
    '</div>';
  
  return L.divIcon({
    className: 'custom-marker-icon',
    html: html,
    iconSize: [null, null],
    iconAnchor: [16, 16],
    popupAnchor: [0, -25]
  });
}

function toggleDetail(popupId) {
  var detailElement = document.getElementById(popupId + '-detail');
  if (detailElement) {
    detailElement.classList.toggle('show');
  }
}

window.toggleDetail = toggleDetail;

var titikLayer = L.layerGroup().addTo(map);

function getOSRMRoute(start, end, callback) {
  var coordinates = start[0] + ',' + start[1] + ';' + end[0] + ',' + end[1];
  var url = 'https://router.project-osrm.org/route/v1/driving/' + coordinates + '?overview=full&geometries=geojson';
  
  fetch(url)
    .then(res => {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      return res.json();
    })
    .then(data => {
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        var routeCoords = data.routes[0].geometry.coordinates;
        console.log('OSRM: Route found with', routeCoords.length, 'points');
        callback(routeCoords);
      } else {
        console.warn('OSRM: No route found. Code:', data.code);
        // Fallback to straight line
        callback([start, end]);
      }
    })
    .catch(err => {
      console.warn('OSRM error:', err.message || err);
      // Fallback to straight line
      callback([start, end]);
    });
}

fetch('jalan-kp.json')
  .then(res => res.json())
  .then(data => {
    var jalanLayer = L.layerGroup().addTo(map);
    var allPolylines = [];
    var allArrowDecorators = [];
    
    function getLineStyle(zoom) {
      if (zoom >= 16) return { weight: 3, opacity: 0.8 };
      if (zoom >= 14) return { weight: 4, opacity: 0.85 };
      if (zoom >= 12) return { weight: 5, opacity: 0.9 };
      return { weight: 6, opacity: 0.9 };
    }
    
    function getArrowStyle(zoom) {
      if (zoom >= 16) return { pixelSize: 8, weight: 1.5, repeat: '20%' };
      if (zoom >= 14) return { pixelSize: 10, weight: 2, repeat: '18%' };
      if (zoom >= 12) return { pixelSize: 12, weight: 2, repeat: '15%' };
      return { pixelSize: 14, weight: 2.5, repeat: '12%' };
    }
    
    var zoomUpdateHandler = function() {
      var newZoom = map.getZoom();
      var newLineStyle = getLineStyle(newZoom);
      var newArrowStyle = getArrowStyle(newZoom);
      
      allPolylines.forEach(function(polyline) {
        if (polyline && polyline.setStyle) {
          polyline.setStyle({
            weight: newLineStyle.weight,
            opacity: newLineStyle.opacity
          });
        }
      });
      
      allArrowDecorators.forEach(function(decoratorInfo) {
        if (decoratorInfo && decoratorInfo.decorator && decoratorInfo.polyline) {
          if (decoratorInfo.decorator.removeFrom) {
            decoratorInfo.decorator.removeFrom(jalanLayer);
          } else {
            jalanLayer.removeLayer(decoratorInfo.decorator);
          }
          
          var newDecorator = L.polylineDecorator(decoratorInfo.polyline, {
            patterns: [{
              offset: '10%',
              repeat: newArrowStyle.repeat,
              symbol: L.Symbol.arrowHead({
                pixelSize: newArrowStyle.pixelSize,
                polygon: false,
                pathOptions: {
                  stroke: true,
                  fillColor: '#ff6b35',
                  fillOpacity: 0.9,
                  color: '#ff6b35',
                  weight: newArrowStyle.weight,
                  opacity: 0.9
                }
              })
            }]
          });
          newDecorator._polyline = decoratorInfo.polyline;
          newDecorator._ruasId = decoratorInfo.ruasId;
          jalanLayer.addLayer(newDecorator);
          
          decoratorInfo.decorator = newDecorator;
        }
      });
    };
    
    map.on('zoomend', zoomUpdateHandler);
    
<<<<<<< HEAD
    // Count how many features will use OSRM (for logging)
    var osrmRequestCount = 0;
    
=======
>>>>>>> a2c85900fd93b135f47dbe8d4e4258f0a0f38782
    data.features.forEach(function(feature, index) {
      if (feature.geometry.type === 'LineString' && feature.geometry.coordinates.length >= 2) {
        var coords = feature.geometry.coordinates;
        var props = feature.properties;
        var namaRuas = props.name || props.Nama_Ruas || "Ruas Jalan";
        var noRuas = props.no_ruas !== undefined && props.no_ruas !== null ? props.no_ruas : "";
        
        var pangkalLonLat = coords[0];
        var ujungLonLat = coords[coords.length - 1];
        
<<<<<<< HEAD
        // Only use OSRM routing if ruasId is specified in URL AND matches this feature
        // Otherwise, use coordinates directly from GeoJSON (straight line)
        if (normalizedRuasId) {
          // Check if this feature matches the requested ruasId
          var normalizedNoRuas = normalizeRuasId(noRuas);
          if (matchesRuasId(normalizedNoRuas, normalizedRuasId)) {
            // User is viewing specific ruasId - use OSRM routing (ONLY for matching features)
            osrmRequestCount++;
            console.log('OSRM Request #' + osrmRequestCount + ' for ruasId:', noRuas);
            getOSRMRoute(pangkalLonLat, ujungLonLat, function(routeCoords) {
              var leafletCoords = routeCoords.map(function(coord) {
                return [coord[1], coord[0]];
              });
              createRoutePolyline(leafletCoords, props, noRuas, namaRuas, pangkalLonLat, ujungLonLat, jalanLayer, allPolylines, allArrowDecorators, normalizedRuasId, titikLayer);
            });
          }
          // If ruasId specified but doesn't match - skip this feature (no request, no display)
        } else {
          // No ruasId specified - use coordinates directly (straight line, NO OSRM request)
=======
        // Only use OSRM routing if ruasId is specified in URL
        // Otherwise, use coordinates directly from GeoJSON (straight line)
        if (normalizedRuasId && matchesRuasId(normalizeRuasId(noRuas), normalizedRuasId)) {
          // User is viewing specific ruasId - use OSRM routing
          console.log('Using OSRM routing for ruasId:', noRuas);
          getOSRMRoute(pangkalLonLat, ujungLonLat, function(routeCoords) {
            var leafletCoords = routeCoords.map(function(coord) {
              return [coord[1], coord[0]];
            });
            createRoutePolyline(leafletCoords, props, noRuas, namaRuas, pangkalLonLat, ujungLonLat, jalanLayer, allPolylines, allArrowDecorators, normalizedRuasId, titikLayer);
          });
        } else if (!normalizedRuasId) {
          // No ruasId specified - use coordinates directly (straight line)
>>>>>>> a2c85900fd93b135f47dbe8d4e4258f0a0f38782
          var leafletCoords = coords.map(function(coord) {
            return [coord[1], coord[0]];
          });
          createRoutePolyline(leafletCoords, props, noRuas, namaRuas, pangkalLonLat, ujungLonLat, jalanLayer, allPolylines, allArrowDecorators, normalizedRuasId, titikLayer);
<<<<<<< HEAD
=======
        } else {
          // ruasId specified but doesn't match - skip this feature
          return;
>>>>>>> a2c85900fd93b135f47dbe8d4e4258f0a0f38782
        }
      }
    });
    
<<<<<<< HEAD
    // Log summary
    if (normalizedRuasId) {
      console.log('Total OSRM requests:', osrmRequestCount, 'for ruasId:', ruasId);
    } else {
      console.log('No OSRM requests - using straight lines for all features');
    }
    
=======
>>>>>>> a2c85900fd93b135f47dbe8d4e4258f0a0f38782
    function createRoutePolyline(leafletCoords, props, noRuas, namaRuas, pangkalLonLat, ujungLonLat, jalanLayer, allPolylines, allArrowDecorators, normalizedRuasId, titikLayer) {
          
          var currentZoom = map.getZoom();
          var lineStyle = getLineStyle(currentZoom);
          var routePolyline = L.polyline(leafletCoords, {
            color: '#ff6b35',
            weight: lineStyle.weight,
            opacity: lineStyle.opacity,
            lineCap: 'round',
            lineJoin: 'round'
          });
          
          routePolyline._ruasId = noRuas;
          routePolyline.feature = { properties: props };
          allPolylines.push(routePolyline);
          routePolyline.bindPopup(formatJalanPopup(props));
          
          var arrowDecorator = null;
          if (typeof L.polylineDecorator !== 'undefined') {
            var arrowStyle = getArrowStyle(currentZoom);
            arrowDecorator = L.polylineDecorator(routePolyline, {
              patterns: [{
                offset: '10%',
                repeat: arrowStyle.repeat,
                symbol: L.Symbol.arrowHead({
                  pixelSize: arrowStyle.pixelSize,
                  polygon: false,
                  pathOptions: {
                    stroke: true,
                    fillColor: '#ff6b35',
                    fillOpacity: 0.9,
                    color: '#ff6b35',
                    weight: arrowStyle.weight,
                    opacity: 0.9
                  }
                })
              }]
            });
            arrowDecorator._polyline = routePolyline;
            arrowDecorator._ruasId = noRuas;
            jalanLayer.addLayer(arrowDecorator);
            
            allArrowDecorators.push({
              decorator: arrowDecorator,
              polyline: routePolyline,
              ruasId: noRuas
            });
          }
          
          jalanLayer.addLayer(routePolyline);
          
          var shouldAddToMap = !normalizedRuasId || matchesRuasId(normalizeRuasId(noRuas), normalizedRuasId);
          if (!shouldAddToMap) {
            routePolyline.setStyle({ opacity: 0, fillOpacity: 0, weight: 0 });
            removeFromMap(routePolyline);
            if (arrowDecorator) {
              arrowDecorator.setStyle({ opacity: 0 });
              removeFromMap(arrowDecorator);
            }
          }
          
          var pangkalCoord = [pangkalLonLat[1], pangkalLonLat[0]];
          var pangkalIcon = createMarkerIcon(noRuas, namaRuas, "Pangkal");
          var pangkalMarker = L.marker(pangkalCoord, { 
            icon: pangkalIcon,
            draggable: false
          });
          pangkalMarker._ruasId = noRuas;
          
          var pangkalPopupId = 'popup-pangkal-' + noRuas;
          var pangkalPopup = '<div class="popup-simple" id="' + pangkalPopupId + '">' +
            '<div class="popup-field">' +
            '<span class="popup-label">No</span>: ' + noRuas +
            '</div>' +
            '<div class="popup-field">' +
            '<span class="popup-label">Nama</span>: ' + namaRuas + ' (Titik Pangkal)' +
            '</div>' +
            '<a class="detail-link" onclick="toggleDetail(\'' + pangkalPopupId + '\')">Detail</a>' +
            '<div class="detail-content" id="' + pangkalPopupId + '-detail">' +
            '<strong>Kapanewon:</strong> ' + (props.kapanewon || '-') + '<br />' +
            '<strong>Kalurahan:</strong> ' + (props.kalurahan || '-') + '<br />' +
            '<strong>Panjang:</strong> ' + (props.panjang_km || '-') + ' km<br />' +
            '<strong>Lebar:</strong> ' + (props.lebar_m || '-') + ' m<br />' +
            '<br /><strong>Koordinat:</strong><br />' +
            'Latitude: ' + pangkalCoord[0].toFixed(6) + '<br />' +
            'Longitude: ' + pangkalCoord[1].toFixed(6) +
            '</div>' +
            '</div>';
          
          var shouldAddMarker = !normalizedRuasId || matchesRuasId(normalizeRuasId(noRuas), normalizedRuasId);
          pangkalMarker.bindPopup(pangkalPopup);
          if (shouldAddMarker) {
            titikLayer.addLayer(pangkalMarker);
          } else {
            titikLayer.addLayer(pangkalMarker);
            removeFromMap(pangkalMarker);
          }
          
          var ujungCoord = [ujungLonLat[1], ujungLonLat[0]];
          var ujungIcon = createMarkerIcon(noRuas, namaRuas, "Ujung");
          var ujungMarker = L.marker(ujungCoord, { 
            icon: ujungIcon,
            draggable: false
          });
          ujungMarker._ruasId = noRuas;
          
          var ujungPopupId = 'popup-ujung-' + noRuas;
          var ujungPopup = '<div class="popup-simple" id="' + ujungPopupId + '">' +
            '<div class="popup-field">' +
            '<span class="popup-label">No</span>: ' + noRuas +
            '</div>' +
            '<div class="popup-field">' +
            '<span class="popup-label">Nama</span>: ' + namaRuas + ' (Titik Ujung)' +
            '</div>' +
            '<a class="detail-link" onclick="toggleDetail(\'' + ujungPopupId + '\')">Detail</a>' +
            '<div class="detail-content" id="' + ujungPopupId + '-detail">' +
            '<strong>Kapanewon:</strong> ' + (props.kapanewon || '-') + '<br />' +
            '<strong>Kalurahan:</strong> ' + (props.kalurahan || '-') + '<br />' +
            '<strong>Panjang:</strong> ' + (props.panjang_km || '-') + ' km<br />' +
            '<strong>Lebar:</strong> ' + (props.lebar_m || '-') + ' m<br />' +
            '<br /><strong>Koordinat:</strong><br />' +
            'Latitude: ' + ujungCoord[0].toFixed(6) + '<br />' +
            'Longitude: ' + ujungCoord[1].toFixed(6) +
            '</div>' +
            '</div>';
          
          ujungMarker.bindPopup(ujungPopup);
          if (shouldAddMarker) {
            titikLayer.addLayer(ujungMarker);
          } else {
            titikLayer.addLayer(ujungMarker);
            removeFromMap(ujungMarker);
          }
    }

    setTimeout(function() {
      var layerControl = L.control.layers(baseMaps, { 
        "Ruas Jalan": jalanLayer,
        "Titik Pangkal & Ujung": titikLayer
      }, { collapsed: false }).addTo(map);

      if (normalizedRuasId) {
        function filterLayerGroup(layerGroup, isMarker) {
          layerGroup.eachLayer(function(layer) {
            var noRuas = getRuasIdFromLayer(layer);
            if (noRuas !== undefined && noRuas !== null) {
              var layerRuasId = normalizeRuasId(noRuas);
              var match = matchesRuasId(layerRuasId, normalizedRuasId);
              if (map.hasLayer(layerGroup)) {
                setLayerVisible(layer, match);
              }
            } else if (!(layer instanceof L.Polyline) && !layer._ruasId) {
              removeFromMap(layer);
            }
          });
        }
        
        jalanLayer._filterByRuasId = function() { filterLayerGroup(jalanLayer, false); };
        titikLayer._filterByRuasId = function() { filterLayerGroup(titikLayer, true); };
        
        map.on('overlayadd', function(e) {
          if (e.layer === jalanLayer) jalanLayer._filterByRuasId();
          if (e.layer === titikLayer) titikLayer._filterByRuasId();
        });
      }

      if (!ruasId && jalanLayer.getLayers().length > 0) {
        var visibleLayers = [];
        jalanLayer.eachLayer(function(layer) {
          if (map.hasLayer(layer)) visibleLayers.push(layer);
        });
        var visibleMarkers = [];
        titikLayer.eachLayer(function(marker) {
          if (map.hasLayer(marker)) visibleMarkers.push(marker);
        });
        
        if (visibleLayers.length > 0 || visibleMarkers.length > 0) {
          var allLayers = new L.featureGroup(visibleLayers.concat(visibleMarkers));
          map.fitBounds(allLayers.getBounds().pad(0.1));
        }
      }
    }, 2000);

    var searchDelay = ruasId ? 1000 : 2500;
    setTimeout(function() {
      if (!ruasId) {
        jalanLayer.eachLayer(function(layer) {
          if (layer.setStyle) layer.setStyle({ opacity: 0.9, fillOpacity: 0.9 });
        });
        titikLayer.eachLayer(function(marker) {
          marker.setOpacity(1);
        });
      } else {
        var matchedLayers = [];
        var matchedMarkers = [];

        function processLayer(layer) {
          var noRuas = getRuasIdFromLayer(layer);
          if (noRuas !== undefined && noRuas !== null) {
            var layerRuasId = normalizeRuasId(noRuas);
            if (matchesRuasId(layerRuasId, normalizedRuasId)) {
              setLayerVisible(layer, true);
              if (layer instanceof L.Polyline) {
                matchedLayers.push(layer);
              }
              return true;
            } else {
              setLayerVisible(layer, false);
              return false;
            }
          } else {
            setLayerVisible(layer, false);
            return false;
          }
        }

        jalanLayer.eachLayer(function(layer) {
          processLayer(layer);
        });

        titikLayer.eachLayer(function(marker) {
          var noRuas = marker._ruasId;
          if (noRuas !== undefined && noRuas !== null) {
            var layerRuasId = normalizeRuasId(noRuas);
            if (matchesRuasId(layerRuasId, normalizedRuasId)) {
              matchedMarkers.push(marker);
              marker.setOpacity(1);
            } else {
              marker.setOpacity(0);
            }
          }
        });

        var found = matchedLayers.length > 0 || matchedMarkers.length > 0;

        if (found && matchedLayers.length > 0) {
          var allMatched = new L.featureGroup(matchedLayers);
          map.fitBounds(allMatched.getBounds(), { padding: [30, 30], maxZoom: 18 });
          if (ruasId) document.getElementById('map').classList.remove('hidden');
          matchedLayers[0].openPopup();
        } else if (found && matchedMarkers.length > 0) {
          var markerBounds = L.latLngBounds(matchedMarkers.map(function(m) { return m.getLatLng(); }));
          map.fitBounds(markerBounds, { padding: [30, 30], maxZoom: 18 });
          if (ruasId) document.getElementById('map').classList.remove('hidden');
          matchedMarkers[0].openPopup();
        } else {
          console.warn('Nomor ruas tidak ditemukan:', ruasId);
          if (ruasId) document.getElementById('map').classList.remove('hidden');
        }
      }
    }, searchDelay);
  })
  .catch(err => console.error('Gagal load GeoJSON Jalan:', err));
