package ru.tamasha.afisha.core.data.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import ru.tamasha.afisha.core.data.AssistantGateway
import ru.tamasha.afisha.core.data.AssistantRepository

@Module
@InstallIn(SingletonComponent::class)
public abstract class BindingsModule {
    @Binds
    public abstract fun assistantGateway(impl: AssistantRepository): AssistantGateway
}
