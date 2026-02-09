"""Peewee migrations -- 033_create_license_plate_tables.py.

This migration creates tables for license plate whitelist/blacklist management
and license plate detection events.

Some examples (model - class or model_name)::

    > Model = migrator.orm['model_name']            # Return model in current state by name
    > migrator.sql(sql)                             # Run custom SQL
    > migrator.run(func, *args, **kwargs)           # Run python code
    > migrator.create_model(Model)                  # Create a model (could be used as decorator)
    > migrator.remove_model(model, cascade=True)    # Remove a model
    > migrator.add_fields(model, **fields)          # Add fields to a model
    > migrator.change_fields(model, **fields)       # Change fields
    > migrator.remove_fields(model, *field_names, cascade=True)
    > migrator.rename_field(model, old_field_name, new_field_name)
    > migrator.rename_table(model, new_table_name)
    > migrator.add_index(model, *col_names, unique=False)
    > migrator.drop_index(model, *col_names)
    > migrator.add_not_null(model, *field_names)
    > migrator.drop_not_null(model, *field_names)
    > migrator.add_default(model, field_name, default)

"""

import peewee as pw

SQL = pw.SQL


def migrate(migrator, database, fake=False, **kwargs):
    # Create license_plate_list table for whitelist/blacklist management
    migrator.sql(
        """
        CREATE TABLE IF NOT EXISTS license_plate_list (
            id VARCHAR(30) PRIMARY KEY NOT NULL,
            plate VARCHAR(20) NOT NULL,
            list_type VARCHAR(10) NOT NULL,
            camera VARCHAR(20),
            description VARCHAR(200),
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
        """
    )
    
    # Create indexes for license_plate_list
    migrator.sql("CREATE INDEX IF NOT EXISTS license_plate_list_plate_idx ON license_plate_list (plate)")
    migrator.sql("CREATE INDEX IF NOT EXISTS license_plate_list_type_idx ON license_plate_list (list_type)")
    migrator.sql("CREATE INDEX IF NOT EXISTS license_plate_list_camera_idx ON license_plate_list (camera)")
    
    # Create license_plate_event table for detection events
    migrator.sql(
        """
        CREATE TABLE IF NOT EXISTS license_plate_event (
            id VARCHAR(30) PRIMARY KEY NOT NULL,
            plate VARCHAR(20) NOT NULL,
            camera VARCHAR(20) NOT NULL,
            list_status VARCHAR(10),
            confidence REAL NOT NULL,
            thumbnail TEXT,
            detected_at DATETIME NOT NULL,
            object_id VARCHAR(30)
        )
        """
    )
    
    # Create indexes for license_plate_event
    migrator.sql("CREATE INDEX IF NOT EXISTS license_plate_event_plate_idx ON license_plate_event (plate)")
    migrator.sql("CREATE INDEX IF NOT EXISTS license_plate_event_camera_idx ON license_plate_event (camera)")
    migrator.sql("CREATE INDEX IF NOT EXISTS license_plate_event_detected_at_idx ON license_plate_event (detected_at)")
    migrator.sql("CREATE INDEX IF NOT EXISTS license_plate_event_list_status_idx ON license_plate_event (list_status)")


def rollback(migrator, database, fake=False, **kwargs):
    migrator.sql("DROP TABLE IF EXISTS license_plate_event")
    migrator.sql("DROP TABLE IF EXISTS license_plate_list")
