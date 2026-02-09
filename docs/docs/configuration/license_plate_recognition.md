# License Plate Recognition

Frigate supports automatic license plate recognition (LPR/ANPR) with whitelist and blacklist functionality.

## Configuration

To enable license plate recognition with whitelist/blacklist support, add the following to your configuration:

```yaml
lpr:
  enabled: true
  whitelist:
    - "ABC123"    # Exact match
    - "XYZ.*"     # Regex pattern
  blacklist:
    - "WANTED.*"  # Regex pattern
  enable_notifications: true
  recognition_threshold: 0.9
  min_plate_length: 4
```

### Configuration Options

- `enabled`: Enable or disable license plate recognition (default: `false`)
- `whitelist`: List of allowed license plates (strings or regex patterns)
- `blacklist`: List of forbidden license plates (strings or regex patterns)
- `enable_notifications`: Enable MQTT notifications for whitelist/blacklist matches (default: `true`)
- `recognition_threshold`: Minimum confidence score required (default: `0.9`)
- `min_plate_length`: Minimum number of characters in a valid plate (default: `4`)
- `known_plates`: Dictionary mapping labels to plate lists for custom identification

## Whitelist and Blacklist

### Whitelist
License plates on the whitelist are marked as "approved" or "authorized" vehicles. This is useful for:
- Resident vehicles
- Company fleet vehicles
- Regular visitors

### Blacklist
License plates on the blacklist are marked as "unauthorized" or "flagged" vehicles. This is useful for:
- Banned vehicles
- Stolen vehicles
- Unauthorized access attempts

### Pattern Matching
Both whitelist and blacklist support:
- Exact matches: `"ABC123"`
- Regex patterns: `"ABC.*"` (matches ABC followed by any characters)

## UI Management

Access the License Plate Management interface through Settings to:
- Add plates to whitelist/blacklist
- Edit existing entries
- View recent detections
- Filter by camera
- Add descriptions to plates

## MQTT Notifications

When a plate matches the whitelist or blacklist, Frigate publishes MQTT messages to:

```
frigate/lpr/{camera_name}/whitelist
frigate/lpr/{camera_name}/blacklist
```

Message payload:
```json
{
  "camera": "front_gate",
  "plate": "ABC123",
  "list_status": "whitelist",
  "confidence": 0.95,
  "timestamp": "2024-02-09T10:30:00"
}
```

## Database Storage

All license plate detections are stored in the database with:
- Plate number
- Camera name
- Detection timestamp
- Confidence score
- List status (whitelist/blacklist/null)
- Link to tracked object

## API Endpoints

### Get All Plates
```http
GET /api/lpr/plates?list_type=whitelist&camera=front_gate
```

### Add Plate
```http
POST /api/lpr/plates
Content-Type: application/json

{
  "plate": "ABC123",
  "list_type": "whitelist",
  "camera": "front_gate",
  "description": "Owner's vehicle"
}
```

### Update Plate
```http
PUT /api/lpr/plates/{plate_id}
Content-Type: application/json

{
  "description": "Updated description"
}
```

### Delete Plate
```http
DELETE /api/lpr/plates/{plate_id}
```

### Get Recent Events
```http
GET /api/lpr/events?limit=100&list_status=blacklist
```

## Integration Examples

### Home Assistant
Monitor for blacklisted vehicles:

```yaml
mqtt:
  sensor:
    - name: "Last Blacklist Detection"
      state_topic: "frigate/lpr/+/blacklist"
      value_template: "{{ value_json.plate }}"
      json_attributes_topic: "frigate/lpr/+/blacklist"
      json_attributes_template: "{{ value_json | tojson }}"
      
automation:
  - alias: "Alert on Blacklist Vehicle"
    trigger:
      - platform: mqtt
        topic: "frigate/lpr/+/blacklist"
    action:
      - service: notify.mobile_app
        data:
          title: "⚠️ Blacklisted Vehicle Detected"
          message: "Plate {{ trigger.payload_json.plate }} detected on {{ trigger.payload_json.camera }}"
```

### Node-RED
Create flows to handle whitelist/blacklist detections and trigger actions like:
- Opening gates for whitelisted vehicles
- Sounding alarms for blacklisted vehicles
- Sending notifications
- Logging events

## Best Practices

1. **Regular Expression Testing**: Test your regex patterns before deployment
2. **Camera Placement**: Ensure cameras have clear view of license plates
3. **Lighting**: Adequate lighting improves recognition accuracy
4. **Regular Updates**: Keep whitelist/blacklist current
5. **Privacy**: Follow local regulations regarding license plate storage and recognition
