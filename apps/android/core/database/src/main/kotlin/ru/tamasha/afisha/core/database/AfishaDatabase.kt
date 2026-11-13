package ru.tamasha.afisha.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Database(
    entities = [FavoriteEntity::class, EventCacheEntity::class, FeedCacheEntity::class, ReminderEntity::class],
    version = 1,
    exportSchema = true,
)
public abstract class AfishaDatabase : RoomDatabase() {
    public abstract fun favorites(): FavoritesDao
    public abstract fun eventCache(): EventCacheDao
    public abstract fun feedCache(): FeedCacheDao
    public abstract fun reminders(): RemindersDao
}

@Module
@InstallIn(SingletonComponent::class)
public object DatabaseModule {
    @Provides
    @Singleton
    public fun database(@ApplicationContext context: Context): AfishaDatabase =
        Room.databaseBuilder(context, AfishaDatabase::class.java, "afisha.db").build()

    @Provides
    public fun favoritesDao(db: AfishaDatabase): FavoritesDao = db.favorites()

    @Provides
    public fun eventCacheDao(db: AfishaDatabase): EventCacheDao = db.eventCache()

    @Provides
    public fun feedCacheDao(db: AfishaDatabase): FeedCacheDao = db.feedCache()

    @Provides
    public fun remindersDao(db: AfishaDatabase): RemindersDao = db.reminders()
}
